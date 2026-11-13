"""Contact-form endpoint: validates the visitor's message and emails it on."""

import logging

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool

from app.api.routes.chat import limiter
from app.core.config import settings
from app.core.errors import raise_bad_request, raise_service_unavailable
from app.schemas.contact import ContactRequest, ContactResponse
from app.services.email_service import EmailServiceError, send_contact_email

logger = logging.getLogger("webpf")
router = APIRouter()

SENT_MESSAGE = "Your message has been sent successfully."
MOCK_MESSAGE = "Message received in test mode — no email was sent."


def build_contact_response(delivered: bool) -> ContactResponse:
    """Tell the visitor whether their message was really emailed."""
    return ContactResponse(message=SENT_MESSAGE if delivered else MOCK_MESSAGE, delivered=delivered)


@router.post("/contact", response_model=ContactResponse)
@limiter.limit(f"{settings.contact_rate_limit}/minute")
async def contact(request: Request, body: ContactRequest) -> ContactResponse:
    """Send a contact-form message; 503 if email delivery is unavailable."""
    try:
        # SMTP / HTTP sending is blocking I/O; run it off the event loop so a
        # slow provider doesn't stall chat requests on the same worker.
        delivered = await run_in_threadpool(
            send_contact_email,
            name=body.name.strip(),
            email=str(body.email),
            subject=body.subject.strip(),
            message=body.message.strip(),
        )
    except ValueError as exc:
        raise_bad_request(exc)
    except EmailServiceError as exc:
        raise_service_unavailable(exc)

    return build_contact_response(delivered)
