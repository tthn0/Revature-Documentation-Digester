from langchain_chroma import Chroma
from langchain_core.documents import Document
from psycopg.errors import UndefinedTable
from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from documentation_digester.domain.user_stories import UserStory
from documentation_digester.service.search_service import UserStoryHit

class UserStoryRepo:
    def __init__(self, db: Session, story_store: Chroma) -> None:
        self.db = db
        self.story_store = story_store

    def has_stories(self) -> bool:
        try:
            return self.db.scalars(select(UserStory).limit(1)).first() is not None
        except ProgrammingError as error:
            self.db.rollback()
            # A missing table means stories have not been loaded yet.
            # A table with the wrong columns is a real error.
            if isinstance(error.orig, UndefinedTable):
                return False
            raise
            
    
    def search(self, question: str, limit: int) -> list[UserStoryHit]:
        docs = self.story_store.similarity_search(question, k=limit)
        story_ids = [int(doc.metadata["story_id"]) for doc in docs]
        stories = self.get_by_ids(story_ids)

        return [
            {
                "user_story_id" : str(story.id),
                "title" : story.title,
                "text" : story.text,
            }
            for story in stories
        ]

    def get_all(self) -> list[UserStory]:
        return list(self.db.scalars(select(UserStory)).all())

    def get_by_ids(self, ids: list[int]) -> list[UserStory]:
        if not ids:
            return []
        
        rows = self.db.scalars(select(UserStory).where(UserStory.id.in_(ids))).all()
        stories_by_id = {story.id: story for story in rows}

        return [stories_by_id[story_id] for story_id in ids if story_id in stories_by_id]

    def index_all(self) -> int:
        stories = self.get_all()

        docs=[
            Document(
                page_content=f"{story.title}\n\n{story.text}\n\nAcceptance criteria:\n{story.acceptance_criteria}",
                metadata={"story_id": story.id},
            )
            for story in stories
        ]
        ids = [str(story.id) for story in stories]
        if docs:
            self.story_store.add_documents(docs, ids=ids)

        return len(docs)

    