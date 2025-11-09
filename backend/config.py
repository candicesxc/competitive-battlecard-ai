from functools import lru_cache

from pydantic import HttpUrl, SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    openai_api_key: SecretStr
    serpapi_api_key: SecretStr = SecretStr(
        "e2cfb7b5e499961816348aa3193ffc2a7e49f0ad7cb8758def02c36a916e2236"
    )
    clearbit_logo_base: HttpUrl = "https://logo.clearbit.com/"  # type: ignore[assignment]
    openai_model: str = "gpt-4.1-mini"
    strategist_model: str = "gpt-4o-mini"
    analyst_model: str = "gpt-4o-mini"

    class Config:
        env_prefix = ""
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""

    return Settings()


