from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    environment: str = "development"
    database_url: str = "sqlite:///./consensus.db"
    openai_api_key: str = ""
    gemini_api_key: str = ""
    alpha_vantage_api_key: str

    class Config:
        env_file = ".env"

settings = Settings()