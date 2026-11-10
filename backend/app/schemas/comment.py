"""Pydantic schemas for ticket comments (CONTRACT §6)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserBrief


class CommentRead(BaseModel):
    """A comment returned by the comments endpoints.

    Employees never receive ``is_internal=True`` comments (filtered in the
    comments service/router).
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_id: int
    user: UserBrief
    comment: str
    is_internal: bool
    created_at: datetime


class CommentCreate(BaseModel):
    """Request body for posting a comment on a ticket.

    Employees cannot mark comments internal; the router forces ``is_internal``
    to ``False`` for them.
    """

    comment: str = Field(min_length=1)
    is_internal: bool = False


__all__ = [
    "CommentRead",
    "CommentCreate",
]
