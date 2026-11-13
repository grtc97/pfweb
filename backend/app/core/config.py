"""Application settings, loaded from environment variables and backend/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Typed runtime configuration. Every field can be overridden by an env var."""

    app_name: str = "webpf backend"
    # "production" turns on stricter checks (e.g. contact mock mode is refused).
    environment: str = "development"
    openai_api_key: str = ""
    openai_model: str = "gpt-6-luna"
    # Upper bound on generated tokens. Reasoning models (e.g. gpt-6-luna) spend
    # part of this on hidden reasoning, so it must leave room for the answer.
    openai_max_completion_tokens: int = Field(default=2000, ge=100, le=32000)
    # Leave unset for reasoning models, which only accept the default (1).
    # Set e.g. 0.3 for older models such as gpt-4o-mini.
    openai_temperature: float | None = Field(default=None, ge=0, le=2)
    openai_timeout_seconds: float = Field(default=45, gt=0, le=120)
    chat_content_path: str = "app/content/chatcontent.md"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
    ]
    chat_mode: str = "openai"
    chat_rate_limit: int = Field(default=10, ge=1, le=100)
    # Contact form delivery: "mock" (no email), "resend" (HTTPS API) or "smtp".
    contact_mode: str = "mock"
    contact_email_to: str = "you@example.com"
    # Sender address for Resend. Resend's shared test sender only delivers to
    # the address that owns the Resend account; verify a domain to change it.
    contact_email_from: str = "onboarding@resend.dev"
    resend_api_key: str = ""
    contact_rate_limit: int = Field(default=5, ge=1, le=30)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    @field_validator("openai_temperature", mode="before")
    @classmethod
    def blank_temperature_means_unset(cls, value: object) -> object:
        """Treat an empty OPENAI_TEMPERATURE= line as "not set" instead of crashing."""
        if isinstance(value, str) and not value.strip():
            return None
        return value

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance (cache_clear() reloads it in tests)."""
    return Settings()


settings = get_settings()
