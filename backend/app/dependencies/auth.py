"""Authentication and authorization FastAPI dependencies.

This module wires JWT-based authentication into the request lifecycle and
exposes role-based access-control (RBAC) dependencies that routers attach to
protect their endpoints.

Key pieces:
- :data:`oauth2_scheme` extracts the bearer token from the ``Authorization``
  header (and powers the "Authorize" button in Swagger).
- :func:`get_current_user` decodes the token, loads the :class:`User`, and
  rejects invalid/expired tokens (401) or deactivated accounts (403).
- :func:`require_roles` is a dependency *factory* that produces a dependency
  enforcing membership in a set of allowed roles, with convenience instances
  (``require_admin``, ``require_manager_or_admin``, ``require_support_or_admin``)
  for the common cases used by the routers.

``get_db`` is re-exported from :mod:`app.database` so routers can import all of
their request dependencies from a single place.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db  # re-exported for convenience
from app.models.enums import UserRole
from app.models.user import User

# Re-export so ``from app.dependencies.auth import get_db`` works.
__all__ = [
    "oauth2_scheme",
    "get_db",
    "get_current_user",
    "get_current_active_user",
    "require_roles",
    "require_admin",
    "require_manager_or_admin",
    "require_support_or_admin",
]

# The ``tokenUrl`` is relative (no leading slash) so Swagger resolves it against
# the server root, matching the real login route ``/api/auth/login``.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# Reusable 401 raised whenever the token is missing, malformed, expired, or its
# subject cannot be resolved to an existing user. ``WWW-Authenticate`` advertises
# the expected scheme per RFC 6750.
_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve and return the authenticated :class:`User` for a request.

    Decodes the bearer JWT, reads the user id from the ``sub`` claim, and loads
    the corresponding user from the database.

    Raises:
        HTTPException 401: token is missing, malformed, expired, has an invalid
            signature, lacks/has an unparsable ``sub`` claim, or references a
            user that no longer exists.
        HTTPException 403: the user exists but has been deactivated
            (``is_active is False``).
    """
    payload: Optional[Dict[str, Any]] = decode_token(token)
    if payload is None:
        raise _CREDENTIALS_EXCEPTION

    subject = payload.get("sub")
    if subject is None:
        raise _CREDENTIALS_EXCEPTION

    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        # ``sub`` was present but not a valid integer id.
        raise _CREDENTIALS_EXCEPTION

    user: Optional[User] = db.get(User, user_id)
    if user is None:
        raise _CREDENTIALS_EXCEPTION

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Return the current user, guaranteed to be active.

    :func:`get_current_user` already rejects inactive accounts with a 403, so
    this is a thin, explicitly-named alias provided for readability at call
    sites that want to make the "active" requirement obvious.
    """
    return current_user


def require_roles(*roles: UserRole) -> Callable[..., User]:
    """Build a dependency that enforces the current user holds one of ``roles``.

    Usage::

        @router.get("/", dependencies=[Depends(require_roles(UserRole.ADMIN))])

    or, to also receive the resolved user::

        def endpoint(user: User = Depends(require_roles(UserRole.ADMIN))):
            ...

    Args:
        *roles: One or more allowed :class:`UserRole` members.

    Returns:
        A FastAPI dependency callable that returns the authenticated
        :class:`User` when their role is permitted, and otherwise raises
        ``HTTPException`` 403.
    """
    allowed = set(roles)

    def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return role_checker


# --- Convenience role dependencies -------------------------------------------
# Instantiated once at import time and reused across routers.
require_admin = require_roles(UserRole.ADMIN)
require_manager_or_admin = require_roles(UserRole.MANAGER, UserRole.ADMIN)
require_support_or_admin = require_roles(UserRole.SUPPORT, UserRole.ADMIN)
