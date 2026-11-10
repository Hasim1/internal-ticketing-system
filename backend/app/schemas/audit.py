"""Pydantic schemas for audit log entries (CONTRACT §6)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import AuditAction
from app.schemas.user import UserBrief


class AuditLogRead(BaseModel):
    """A single audit log entry returned by the audit endpoint (admin only).

    ``user`` is nullable because some actions may be system-originated or the
    acting user may have since been removed.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    user: Optional[UserBrief] = None
    action: AuditAction
    entity_type: str
    entity_id: Optional[int] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    created_at: datetime


__all__ = [
    "AuditLogRead",
]
