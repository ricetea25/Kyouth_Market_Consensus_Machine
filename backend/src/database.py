from sqlmodel import SQLModel, create_engine, Session
from .config import settings

# check_same_thread=False is needed for SQLite with FastAPI
engine = create_engine(
    settings.database_url, 
    connect_args={"check_same_thread": False}
)

def init_db():
    """Creates the tables in SQLite if they don't exist"""
    SQLModel.metadata.create_all(engine)

def get_session():
    """Dependency injection for FastAPI endpoints"""
    with Session(engine) as session:
        yield session