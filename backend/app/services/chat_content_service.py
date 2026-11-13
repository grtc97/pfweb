"""Loads the markdown file the chatbot answers from."""

import logging
from pathlib import Path

from app.core.config import BACKEND_ROOT, settings

logger = logging.getLogger("webpf")


def _resolve_content_path() -> Path:
    """Resolve CHAT_CONTENT_PATH, treating relative paths as backend-relative."""
    configured = Path(settings.chat_content_path)
    if configured.is_absolute():
        return configured
    return BACKEND_ROOT / configured


def load_chat_content() -> str:
    """Return the chatbot knowledge file's text, or "" if it is missing/unreadable.

    Falling back to "" keeps the chatbot running (it will say it lacks the
    information) instead of failing every request.
    """
    content_path = _resolve_content_path()
    if not content_path.exists():
        logger.warning("Chat content file not found at %s", content_path)
        return ""
    try:
        return content_path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeDecodeError):
        logger.exception("Could not read chat content file at %s", content_path)
        return ""


def chat_content_exists() -> bool:
    """True when the chatbot knowledge file is present on disk."""
    return _resolve_content_path().exists()
