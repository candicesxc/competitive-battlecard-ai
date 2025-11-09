from functools import lru_cache
from typing import Literal, Optional

from pydantic import HttpUrl, SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    openai_api_key: SecretStr
    serper_api_key: Optional[SecretStr] = None
    serpapi_api_key: Optional[SecretStr] = None
    search_provider: Optional[Literal["serper", "serpapi"]] = None
    clearbit_logo_base: HttpUrl = "https://logo.clearbit.com/"  # type: ignore[assignment]
    openai_model: str = "gpt-4.1-mini"
    strategist_model: str = "gpt-4o-mini"
    analyst_model: str = "gpt-4o-mini"

    @staticmethod
    def _clean_secret(secret: Optional[SecretStr]) -> Optional[str]:
        """Return a stripped secret value or ``None`` when empty."""

        if not secret:
            return None
        value = secret.get_secret_value().strip()
        return value or None

    def determine_search_provider(self) -> Literal["serper", "serpapi"]:
        """Return the configured search provider based on environment variables."""

        if self.search_provider:
            return self.search_provider
        serper_key = self._clean_secret(self.serper_api_key)
        if serper_key:
            return "serper"
        serpapi_key = self._clean_secret(self.serpapi_api_key)
        if serpapi_key:
            return "serpapi"
        raise ValueError(
            "No search provider configured. Provide SERPER_API_KEY or SERPAPI_API_KEY."
        )

    class Config:
        env_prefix = ""
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""

    return Settings()


