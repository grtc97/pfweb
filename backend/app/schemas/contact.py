"""Request/response models for the contact-form API."""

from pydantic import BaseModel, EmailStr, Field


class ContactRequest(BaseModel):
    """A visitor's contact-form submission."""

    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=5000)


class ContactResponse(BaseModel):
    """Result shown to the visitor; ``delivered`` is False in mock mode."""

    message: str
    delivered: bool = True
