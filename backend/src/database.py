from sqlalchemy import inspect, text
from sqlmodel import SQLModel, create_engine, Session

from .config import settings

# check_same_thread=False is needed for SQLite with FastAPI
engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})


def init_db():
    """Create tables and add columns introduced before formal migrations exist."""
    SQLModel.metadata.create_all(engine)
    existing_columns = {
        column["name"] for column in inspect(engine).get_columns("stockconsensus")
    }
    migrations = {
        "confidence_score": (
            "ALTER TABLE stockconsensus "
            "ADD COLUMN confidence_score FLOAT NOT NULL DEFAULT 0.5"
        ),
        "market_movement": (
            "ALTER TABLE stockconsensus "
            "ADD COLUMN market_movement JSON NOT NULL DEFAULT '{}'"
        ),
        "analysis_status": (
            "ALTER TABLE stockconsensus "
            "ADD COLUMN analysis_status VARCHAR NOT NULL DEFAULT 'complete'"
        ),
        "analysis_error": (
            "ALTER TABLE stockconsensus ADD COLUMN analysis_error VARCHAR"
        ),
    }

    with engine.begin() as connection:
        for column_name, statement in migrations.items():
            if column_name not in existing_columns:
                connection.execute(text(statement))


def get_session():
    """Dependency injection for FastAPI endpoints"""
    with Session(engine) as session:
        yield session
