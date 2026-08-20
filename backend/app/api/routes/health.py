from fastapi import APIRouter

from app.core.config import settings
from app.services.chat_content_service import chat_content_exists, load_chat_content

router = APIRouter()


def _is_openai_configured() -> bool:
    return bool(settings.openai_api_key) or settings.chat_mode.lower() == "mock"


def _build_health_payload() -> dict[str, str | bool]:
    chat_content_loaded = bool(load_chat_content())
    openai_configured = _is_openai_configured()

    return {
        "status": "ok" if chat_content_loaded and openai_configured else "degraded",
        "chat_mode": settings.chat_mode,
        "chat_content_loaded": chat_content_loaded,
        "chat_content_file_exists": chat_content_exists(),
        "openai_configured": openai_configured,
    }


@router.get("/health")
def health_check() -> dict[str, str | bool]:
    return _build_health_payload()
