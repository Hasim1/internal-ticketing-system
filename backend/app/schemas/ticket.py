"""Pydantic schemas for the ``Ticket`` resource (CONTRACT §6)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TicketCategory, TicketPriority, TicketStatus
from app.schemas.department import DepartmentBrief
from app.schemas.user import UserBrief


class TicketRead(BaseModel):
    """Full ticket representation returned by ticket endpoints.

    Nested actors are serialized as compact briefs: ``created_by`` /
    ``assigned_to`` as :class:`UserBrief`, ``department`` as
    :class:`DepartmentBrief`.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    status: TicketStatus
    priority: TicketPriority
    category: TicketCategory
    created_by: UserBrief
    assigned_to: Optional[UserBrief] = None
    department: Optional[DepartmentBrief] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None


class TicketCreate(BaseModel):
    """Request body for creating a ticket.

    ``created_by`` is taken from the authenticated user and ``status`` defaults
    to ``open`` in the service layer, so neither is accepted here.
    """

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    category: TicketCategory
    priority: TicketPriority = TicketPriority.MEDIUM
    department_id: Optional[int] = None


class TicketUpdate(BaseModel):
    """Request body for editing a ticket's core fields.

    All fields optional; only provided fields are applied.
    """

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, min_length=1)
    category: Optional[TicketCategory] = None
    department_id: Optional[int] = None


class AssignRequest(BaseModel):
    """Request body for assigning (or unassigning) a ticket.

    ``assigned_to_id`` of ``None`` unassigns the ticket.
    """

    assigned_to_id: Optional[int] = None


class StatusUpdate(BaseModel):
    """Request body for changing a ticket's status."""

    status: TicketStatus


class PriorityUpdate(BaseModel):
    """Request body for changing a ticket's priority."""

    priority: TicketPriority


__all__ = [
    "TicketRead",
    "TicketCreate",
    "TicketUpdate",
    "AssignRequest",
    "StatusUpdate",
    "PriorityUpdate",
]
