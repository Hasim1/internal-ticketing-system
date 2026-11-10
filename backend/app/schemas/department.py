"""Pydantic schemas for the ``Department`` resource (CONTRACT §6)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DepartmentBrief(BaseModel):
    """Compact department reference embedded inside other read models."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class DepartmentRead(BaseModel):
    """Full department representation returned by department endpoints.

    ``user_count`` / ``ticket_count`` are populated by the service layer when
    available; they default to ``0`` so the field is always present.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    user_count: int = 0
    ticket_count: int = 0


class DepartmentCreate(BaseModel):
    """Request body for creating a department (admin only)."""

    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)


class DepartmentUpdate(BaseModel):
    """Request body for updating a department (admin only).

    All fields optional; only provided fields are applied.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)


__all__ = [
    "DepartmentBrief",
    "DepartmentRead",
    "DepartmentCreate",
    "DepartmentUpdate",
]
