"""Health-check endpoint used by the frontend status pill and Render."""

from fastapi import APIRouter

from app.core.config import settings
from app.services.chat_content_service import chat_content_exists, load_chat_content
from app.services.email_service import get_contact_mode, is_email_configured

router = APIRouter()


def _is_openai_configured() -> bool:
    """True when chat can answer: an API key is set, or mock mode is on."""
    return bool(settings.openai_api_key) or settings.chat_mode.lower() == "mock"


def _build_health_payload() -> dict[str, str | bool]:
    """Report chat and contact readiness without exposing any secrets.

    ``status`` reflects the chatbot only (it drives the chat status pill);
    contact-form readiness is reported separately.
    """
    chat_content_loaded = bool(load_chat_content())
    openai_configured = _is_openai_configured()

    return {
        "status": "ok" if chat_content_loaded and openai_configured else "degraded",
        "chat_mode": settings.chat_mode,
        "chat_content_loaded": chat_content_loaded,
        "chat_content_file_exists": chat_content_exists(),
        "openai_configured": openai_configured,
        "contact_mode": get_contact_mode(),
        "contact_configured": is_email_configured(),
    }


@router.get("/health")
def health_check() -> dict[str, str | bool]:
    """Return the current health payload."""
    return _build_health_payload()
