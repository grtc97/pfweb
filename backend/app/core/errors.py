from typing import NoReturn

from fastapi import HTTPException


def raise_bad_request(exc: Exception) -> NoReturn:
    """Translate a validation-style exception (e.g. ValueError) into a 400 response."""
    raise HTTPException(status_code=400, detail=str(exc)) from exc


def raise_service_unavailable(exc: Exception) -> NoReturn:
    """Translate an upstream-service failure (e.g. OpenAI, SMTP) into a 503 response."""
    raise HTTPException(status_code=503, detail=str(exc)) from exc
