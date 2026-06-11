from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "development"
    database_url: str = "sqlite:///./src/consensus.db"
    openai_api_key: str = ""
    gemini_api_key: str = ""
    alpha_vantage_api_key: str
    frontend_origin: str = "http://localhost:3000"
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"

    class Config:
        env_file = ".env"


settings = Settings()
