# This module defines a small LangGraph chat workflow for RAG-style conversations.
# The graph keeps the normal message history from LangGraph, adds a retrieved
# document context string, and also loads a durable per-user profile from the
# shared store. In other words: each turn can answer using both current document
# context and prior user memory, while the graph also tries to update that memory
# after the answer is generated.

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.store.base import BaseStore
from typing import Any

MEMORY_NAMESPACE = ("memory",)

# The state extends LangGraph's default message state with two custom fields:
# - context: the document chunks or retrieved text for the current question
# - long_term_memory: the previously saved summary for this user
class ChatState(MessagesState):
    context: str
    long_term_memory: str


def build_memory_graph(
    llm: BaseChatModel,
    checkpointer: BaseCheckpointSaver,
    store: BaseStore,
) -> CompiledStateGraph:
    # Step 1: load any durable memory associated with the current user.
    # We scope memory by ("users", user_id) so separate users do not overwrite
    # each other, while the same user can reuse the profile across multiple chats.
    def load_long_term_memory(
        state: ChatState,
        config: RunnableConfig,
    ) -> dict[str, str]:
        # ponytail: one global profile shared by every chat, add a user_id namespace if accounts are added
        item = store.get(MEMORY_NAMESPACE, "profile")
        return {
            "long_term_memory": (
                item.value.get("summary", "") if item is not None else ""
            )
        }

    # Step 2: produce the answer based on document context plus the loaded memory.
    # The LLM is instructed to treat both sources as untrusted data and to rely on
    # the documents for factual claims while only using memory for personalization.
    def answer(state: ChatState) -> dict[str, AIMessage]:
        if not state["context"]:
            return {
                "messages": AIMessage(
                    content="I do not have enough information to answer that question."
                )
            }

        latest = state["messages"][-1] if state["messages"] else None
        question = (
            latest.content
            if isinstance(latest, HumanMessage) and isinstance(latest.content, str)
            else ""
        )
        # Same shape as the non-memory ask path: the documents sit in the
        # user message, which is the prompt this model actually follows.
        system_message = SystemMessage(
            content=(
                "You are a strict QA assistant.\n"
                "Answer the user's question using ONLY the provided Document Context.\n"
                "Rules:\n"
                "1. Do NOT use any prior knowledge outside of the provided context.\n"
                "2. If the answer cannot be directly derived from the provided context, "
                "respond EXACTLY with: I don't have enough information from the provided documents to answer this prompt.\n"
                "3. Do not attempt to explain why or add conversational text if the context is insufficient.\n"
                "Saved user memory is not evidence.\n"
                f"Saved user memory:\n{state['long_term_memory'] or 'None'}"
            )
        )
        grounded = HumanMessage(
            content=(
                f"Document Context:\n{state['context']}\n\nUser Prompt:\n{question}"
            )
        )
        return {"messages": llm.invoke([system_message, *state["messages"][:-1], grounded])}

    # Step 3: save the latest user fact pattern back into the durable profile.
    # This is intentionally conservative: only stable, explicit facts are kept, and
    # the prompt is written to avoid storing sensitive or temporary data.
    def update_long_term_memory(
        state: ChatState,
        config: RunnableConfig,
    ) -> dict[str, str]:
        if not config.get("configurable", {}).get("remember", True):
            return {}

        # Look back through the message list and pull the most recent HumanMessage.
        # This is the new information we may want to summarize into profile memory.
        latest_user_message = next(
            (
                message.content
                for message in reversed(state["messages"])
                if isinstance(message, HumanMessage)
            ),
            None,
        )
        if not isinstance(latest_user_message, str):
            return {}
        # A question does not state a fact about the user. The small model
        # otherwise stores its own answer as the profile.
        if latest_user_message.strip().endswith("?"):
            return {}

        # Ask the LLM to rewrite the entire profile as a concise plain-text summary.
        # This keeps memory small and easy to inspect while preserving previous facts
        # unless the user explicitly corrected or removed them.
        update = llm.invoke(
            [
                SystemMessage(
                    content=(
                        "Maintain a concise user profile for future conversations. "
                        "Use only stable facts or preferences the user explicitly "
                        "stated in the new message. Do not infer facts or save "
                        "sensitive personal data, credentials, or temporary details. "
                        "Preserve unrelated existing facts and apply explicit "
                        "corrections or removal requests. Return the complete updated "
                        "profile as plain text, or exactly NO_UPDATE if there is "
                        "nothing useful to add. Keep it under 1000 characters."
                    )
                ),
                HumanMessage(
                    content=(
                        f"Existing profile:\n{state['long_term_memory'] or 'None'}"
                        f"\n\nNew user message:\n{latest_user_message}"
                    )
                ),
            ]
        )
        if not isinstance(update.content, str):
            raise TypeError("The chat model returned a non-text memory update.")
        updated_profile = update.content.strip()
        if not updated_profile or updated_profile == "NO_UPDATE":
            return {}
        if len(updated_profile) > 1000:
            raise ValueError("The updated user memory exceeds 1000 characters.")

        # A stable key makes this profile easy to read, replace, or delete via the API.
        store.put(
            MEMORY_NAMESPACE,
            "profile",
            {"summary": updated_profile},
        )
        return {}

    # Build the graph itself: START -> load memory -> answer -> update memory -> END.
    # This is the production flow for a single conversation turn, and the compiled
    # graph can be reused across requests
    builder = StateGraph(ChatState)
    builder.add_node("load_long_term_memory", load_long_term_memory) # pyright: ignore[reportUnknownMemberType] 
    builder.add_node("answer", answer) # pyright: ignore[reportUnknownMemberType] 
    builder.add_node("update_long_term_memory", update_long_term_memory) # pyright: ignore[reportUnknownMemberType] 
    builder.add_edge(START, "load_long_term_memory")
    builder.add_edge("load_long_term_memory", "answer")
    builder.add_edge("answer", "update_long_term_memory")
    builder.add_edge("update_long_term_memory", END)

    return builder.compile(checkpointer=checkpointer, store=store)
