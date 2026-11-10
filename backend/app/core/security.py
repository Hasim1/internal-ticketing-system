"""Password hashing and JWT helpers.

Uses ``passlib`` (bcrypt) for password hashing and ``python-jose`` (HS256) for
signing and decoding access tokens. Secret and expiry come from settings.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# Single shared password-hashing context. ``deprecated="auto"`` lets passlib
# transparently upgrade hashes if the scheme list changes in the future.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return a bcrypt hash for the given plaintext password."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return ``True`` if ``plain`` matches the stored ``hashed`` password."""
    return pwd_context.verify(plain, hashed)


def create_access_token(
    subject: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token.

    Args:
        subject: The token subject; conventionally ``str(user.id)``.
        role: The user's role string (e.g. ``"admin"``).
        expires_delta: Optional custom lifetime. Defaults to
            ``settings.ACCESS_TOKEN_EXPIRE_MINUTES``.

    Returns:
        The encoded JWT as a string. Payload is ``{"sub", "role", "exp"}``.
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.now(timezone.utc) + expires_delta
    payload: Dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify a JWT access token.

    Returns the decoded claims dict on success, or ``None`` if the token is
    malformed, has an invalid signature, or has expired.
    """
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        return None
