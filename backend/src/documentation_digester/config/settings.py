import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel

from documentation_digester.config.paths import PATHS

load_dotenv()


class Settings(BaseModel):
    DATABASE_URL: str
    DEBUG: bool = False 
    OLLAMA_BASE_URL: str
    OLLAMA_LLM_MODEL: str
    OLLAMA_EMBEDDING_MODEL: str
    TEMPERATURE: float = 0.3

    CHROMA_DIRECTORY: Path = PATHS.ROOT_DIRECTORY / "data" / "chroma"
    SUPPORTED_EXTENSIONS: set[str] = {".txt", ".rst", ".md", ".pdf", ".docx"}

    CHUNKING_STRATEGY: Literal["semantic", "text_splitter"] = "semantic"
    TEXT_SPLITTER_CHUNK_SIZE: int = 1000
    TEXT_SPLITTER_CHUNK_OVERLAP: int = 200
    SEMANTIC_CHUNKER_BREAKPOINT_THRESHOLD: float = 85


settings = Settings(
    DATABASE_URL=os.getenv("DATABASE_URL"),
    OLLAMA_BASE_URL=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    OLLAMA_LLM_MODEL=os.getenv("OLLAMA_LLM_MODEL")
    or os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b"),
    OLLAMA_EMBEDDING_MODEL=os.getenv(
        "OLLAMA_EMBEDDING_MODEL",
        "nomic-embed-text:latest",
    ),
)
