from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "development"
    database_url: str = "sqlite:///./src/consensus.db"
    openai_api_key: str = ""
    gemini_api_key: str = ""
    alpha_vantage_api_key: str
    frontend_origin: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
