"""Pydantic schemas for the ``User`` resource (CONTRACT §6)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole
from app.schemas.department import DepartmentBrief


class UserBrief(BaseModel):
    """Compact user reference embedded inside other read models."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    role: UserRole


class UserRead(BaseModel):
    """Full user representation returned by user/auth endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    role: UserRole
    department_id: Optional[int] = None
    department: Optional[DepartmentBrief] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    """Request body for creating a user (admin only)."""

    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole
    department_id: Optional[int] = None
    is_active: bool = True


class UserUpdate(BaseModel):
    """Request body for updating a user's profile fields (admin only).

    Role changes go through :class:`RoleUpdate`; activation/deactivation use
    dedicated endpoints. Only provided fields are applied.
    """

    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    department_id: Optional[int] = None


class RoleUpdate(BaseModel):
    """Request body for changing a user's role (admin only)."""

    role: UserRole


__all__ = [
    "UserBrief",
    "UserRead",
    "UserCreate",
    "UserUpdate",
    "RoleUpdate",
]
