"""Request/response models for the chat API."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Only the most recent messages are useful to the model (and they cost tokens),
# so longer histories are trimmed instead of rejected.
MAX_HISTORY_MESSAGES = 20


class ChatMessage(BaseModel):
    """One earlier turn of the conversation."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    """A new question plus recent history (capped to limit token cost)."""

    message: str = Field(min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list)

    @field_validator("history", mode="before")
    @classmethod
    def keep_recent_history(cls, value: object) -> object:
        """Keep only the last MAX_HISTORY_MESSAGES items.

        Rejecting long histories made a long conversation fail with
        "List should have at most 20 items" after about 10 questions.
        """
        if isinstance(value, list) and len(value) > MAX_HISTORY_MESSAGES:
            return value[-MAX_HISTORY_MESSAGES:]
        return value


class ChatResponse(BaseModel):
    """The assistant's answer."""

    answer: str
