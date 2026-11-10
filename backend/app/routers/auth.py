"""Authentication routes: registration, login, and current-user retrieval.

Implements CONTRACT §5 "Auth". The router stays thin: user persistence and
audit side-effects are delegated to the service layer (:mod:`app.services`),
while password verification and token minting live in :mod:`app.core.security`.

Routes (mounted under ``/api`` by ``main.py``):
- ``POST /api/auth/register`` — self-service signup, always ``employee`` role.
- ``POST /api/auth/login`` — password login returning a JWT + the user.
- ``GET  /api/auth/me``     — the authenticated user's profile.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies.auth import get_current_user, get_db
from app.models.enums import AuditAction, UserRole
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserRead
from app.services import audit_service, user_service

router = APIRouter(prefix="/auth", tags=["auth"])

# Entity label used for audit rows written from this router.
_USER_ENTITY = "user"


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account (employee role)",
)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
) -> User:
    """Self-register a new user.

    The new account is always created with the ``employee`` role regardless of
    any client input; privileged roles are assigned only by an admin through the
    users API.

    Raises:
        HTTPException 409: an account with the supplied email already exists.

    Returns:
        The newly created user serialized as :class:`UserRead` (HTTP 201).
    """
    existing = user_service.get_user_by_email(db, payload.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Self-registration has no privileged actor, so the account is created here
    # (rather than via `user_service.create_user`, which expects an admin actor
    # for its `user_created` audit row). The new user is forced to the employee
    # role and a `user_created` audit row is attributed to the account itself.
    new_user = User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.EMPLOYEE,
        department_id=payload.department_id,
        is_active=True,
    )
    db.add(new_user)
    db.flush()  # assign the primary key so it can be referenced by the audit row

    audit_service.log_action(
        db,
        user_id=new_user.id,
        action=AuditAction.USER_CREATED,
        entity_type=_USER_ENTITY,
        entity_id=new_user.id,
        old_value=None,
        new_value=new_user.email,
    )

    db.commit()
    db.refresh(new_user)
    return new_user


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate and obtain an access token",
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Verify credentials and issue a JWT access token.

    On success a ``login`` audit-log row is written and committed. The same
    generic 401 is returned for both an unknown email and a wrong password so
    the endpoint does not leak which accounts exist.

    Raises:
        HTTPException 401: the email is unknown or the password is incorrect.
        HTTPException 403: the account exists but has been deactivated.

    Returns:
        A :class:`TokenResponse` carrying the bearer token and the user.
    """
    user = user_service.get_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    # Record the successful login, then commit so the audit row is persisted.
    audit_service.log_action(
        db,
        user_id=user.id,
        action=AuditAction.LOGIN,
        entity_type=_USER_ENTITY,
        entity_id=user.id,
        old_value=None,
        new_value=user.email,
    )
    db.commit()

    access_token = create_access_token(
        subject=str(user.id),
        role=user.role.value,
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserRead.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserRead,
    summary="Get the currently authenticated user",
)
def read_current_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Return the profile of the authenticated user (HTTP 200)."""
    return current_user
