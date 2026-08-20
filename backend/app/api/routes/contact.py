from fastapi import APIRouter, Request

from app.api.routes.chat import limiter
from app.core.config import settings
from app.core.errors import raise_bad_request, raise_service_unavailable
from app.schemas.contact import ContactRequest, ContactResponse
from app.services.email_service import EmailServiceError, send_contact_email

router = APIRouter()


@router.post("/contact", response_model=ContactResponse)
@limiter.limit(f"{settings.contact_rate_limit}/minute")
async def contact(request: Request, body: ContactRequest) -> ContactResponse:
    try:
        send_contact_email(
            name=body.name.strip(),
            email=str(body.email),
            subject=body.subject.strip(),
            message=body.message.strip(),
        )
    except ValueError as exc:
        raise_bad_request(exc)
    except EmailServiceError as exc:
        raise_service_unavailable(exc)

    return ContactResponse(message="Your message has been sent successfully.")
