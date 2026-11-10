"""Pydantic schemas for authentication endpoints (CONTRACT §6, §4)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserRead


class RegisterRequest(BaseModel):
    """Request body for self-registration (``POST /api/auth/register``).

    The created user always receives the ``employee`` role regardless of input
    (enforced in the auth service/router).
    """

    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    department_id: Optional[int] = None


class LoginRequest(BaseModel):
    """Request body for password login (``POST /api/auth/login``)."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    """Successful login response carrying the JWT and the current user."""

    access_token: str
    token_type: str = "bearer"
    user: UserRead


__all__ = [
    "RegisterRequest",
    "LoginRequest",
    "TokenResponse",
]
