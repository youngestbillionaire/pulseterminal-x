from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    INTERNAL_API_KEY: str = "dev-internal-key"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/pulseterminal"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # LLM
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    LLM_PROVIDER: str = "anthropic"  # anthropic | openai

    # Reddit (PRAW)
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    REDDIT_USER_AGENT: str = "PulseTerminalX/1.0"

    # News
    NEWS_API_KEY: str = ""
    ALPHA_VANTAGE_KEY: str = ""
    POLYGON_API_KEY: str = ""

    # Sentiment model
    SENTIMENT_MODEL: str = "ProsusAI/finbert"
    USE_GPU: bool = False

    # Rate limits
    REDDIT_CALLS_PER_MINUTE: int = 60
    NEWS_CALLS_PER_HOUR: int = 100

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
