from pathlib import Path

from app.core.config import BACKEND_ROOT, settings


def _resolve_content_path() -> Path:
    configured = Path(settings.chat_content_path)
    if configured.is_absolute():
        return configured
    return BACKEND_ROOT / configured


def load_chat_content() -> str:
    content_path = _resolve_content_path()
    if not content_path.exists():
        return ""
    return content_path.read_text(encoding="utf-8").strip()


def chat_content_exists() -> bool:
    return _resolve_content_path().exists()
