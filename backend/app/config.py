from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./cerebro.db"
    groq_api_key: str = ""
    confidence_threshold: float = 0.75

    class Config:
        env_file = ".env"


settings = Settings()
