from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    environment: str = "development"
    database_url: str = "sqlite:///./consensus.db"
    openai_api_key: str = "" # Needed later for your AI schemas

    class Config:
        env_file = ".env"

settings = Settings()