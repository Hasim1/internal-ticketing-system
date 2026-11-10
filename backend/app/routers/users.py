"""User-management routes (CONTRACT §5 "Users").

Listing and single retrieval are available to admins and managers (managers are
transparently scoped to their own department by the service layer). All
mutating operations — creation, profile edits, role changes and
activation/deactivation — are admin-only and delegate their persistence and
audit side-effects to :mod:`app.services.user_service`.

The router stays thin: it resolves access control via the dependencies in
:mod:`app.dependencies.auth`, validates the target's existence, enforces the
few router-level invariants (duplicate email on create, self-deactivation
guard), and returns ORM models serialized by the Read/Paginated schemas.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.dependencies.auth import (
    get_db,
    require_admin,
    require_manager_or_admin,
)
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.common import PaginatedUsers
from app.schemas.user import RoleUpdate, UserCreate, UserRead, UserUpdate
from app.services import user_service
from app.utils.pagination import (
    DEFAULT_PAGE,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    build_page,
    paginate,
)

router = APIRouter(prefix="/users", tags=["users"])


def _get_user_or_404(db: Session, user_id: int) -> User:
    """Return the user with ``user_id`` or raise a 404.

    Args:
        db: Active session.
        user_id: Primary key of the requested user.

    Raises:
        HTTPException 404: no user with that id exists.
    """
    user = user_service.get_user(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.get(
    "/",
    response_model=PaginatedUsers,
    summary="List users (admin sees all, manager sees own department)",
)
def list_users(
    role: Optional[UserRole] = Query(
        default=None, description="Filter by exact role."
    ),
    department_id: Optional[int] = Query(
        default=None, description="Filter by department id."
    ),
    is_active: Optional[bool] = Query(
        default=None, description="Filter by active state."
    ),
    search: Optional[str] = Query(
        default=None,
        description="Case-insensitive match against full name or email.",
    ),
    page: int = Query(default=DEFAULT_PAGE, ge=1, description="1-based page number."),
    page_size: int = Query(
        default=DEFAULT_PAGE_SIZE,
        ge=1,
        le=MAX_PAGE_SIZE,
        description="Items per page.",
    ),
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Return a paginated list of users visible to the requester.

    Admins see every user; managers are scoped by the service to users in their
    own department. The optional filters are applied on top of that visibility
    scope. Results are ordered by id for a stable pagination order.
    """
    query = user_service.visible_users_query(db, current_user)
    query = user_service.apply_user_filters(
        query,
        role=role,
        department_id=department_id,
        is_active=is_active,
        search=search,
    )
    query = query.order_by(User.id.asc())

    items, total, _pages = paginate(query, page=page, page_size=page_size)
    return build_page(items, total=total, page=page, page_size=page_size)


@router.get(
    "/{user_id}",
    response_model=UserRead,
    summary="Get a single user by id",
)
def get_user(
    user_id: int,
    current_user: User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
) -> User:
    """Return a single user by id.

    Admins may read any user. Managers may only read users within their own
    department; attempting to read a user outside it yields a 404 so the
    endpoint does not reveal the existence of out-of-scope accounts.

    Raises:
        HTTPException 404: the user does not exist or is outside a manager's
            department scope.
    """
    user = _get_user_or_404(db, user_id)

    if current_user.role == UserRole.MANAGER and (
        user.department_id != current_user.department_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


@router.post(
    "/",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user (admin only)",
)
def create_user(
    payload: UserCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    """Create a new user with an explicit role (admin only).

    Raises:
        HTTPException 409: an account with the supplied email already exists.

    Returns:
        The created user serialized as :class:`UserRead` (HTTP 201). The service
        writes a ``user_created`` audit entry.
    """
    if user_service.get_user_by_email(db, payload.email) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    new_user = user_service.create_user(
        db,
        actor=current_user,
        data={
            "full_name": payload.full_name,
            "email": payload.email,
            "password": payload.password,
            "role": payload.role,
            "department_id": payload.department_id,
            "is_active": payload.is_active,
        },
    )
    return new_user


@router.put(
    "/{user_id}",
    response_model=UserRead,
    summary="Update a user's profile fields (admin only)",
)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    """Update a user's editable profile fields (``full_name``, ``email``,
    ``department_id``); admin only.

    Only fields explicitly provided in the request body are applied. Changing a
    user's email to one already taken by another account is rejected.

    Raises:
        HTTPException 404: the target user does not exist.
        HTTPException 409: the requested email belongs to a different user.
    """
    target = _get_user_or_404(db, user_id)

    if payload.email is not None and payload.email != target.email:
        clash = user_service.get_user_by_email(db, payload.email)
        if clash is not None and clash.id != target.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )

    updated = user_service.update_user(
        db,
        actor=current_user,
        target=target,
        data=payload.model_dump(exclude_unset=True),
    )
    return updated


@router.patch(
    "/{user_id}/role",
    response_model=UserRead,
    summary="Change a user's role (admin only)",
)
def change_user_role(
    user_id: int,
    payload: RoleUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    """Change a user's role; admin only.

    The service records a ``user_role_changed`` audit entry capturing the old
    and new role values.

    Raises:
        HTTPException 404: the target user does not exist.
    """
    target = _get_user_or_404(db, user_id)
    updated = user_service.change_role(
        db,
        actor=current_user,
        target=target,
        new_role=payload.role,
    )
    return updated


@router.patch(
    "/{user_id}/deactivate",
    response_model=UserRead,
    summary="Deactivate a user (admin only)",
)
def deactivate_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    """Deactivate (soft-disable) a user account; admin only.

    Admins cannot deactivate their own account — doing so could lock the system
    out of administrative access. The service records a ``user_deactivated``
    audit entry.

    Raises:
        HTTPException 400: the admin attempted to deactivate themselves.
        HTTPException 404: the target user does not exist.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )

    target = _get_user_or_404(db, user_id)
    updated = user_service.deactivate_user(db, actor=current_user, target=target)
    return updated


@router.patch(
    "/{user_id}/activate",
    response_model=UserRead,
    summary="Activate a user (admin only)",
)
def activate_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    """Reactivate a previously-deactivated user account; admin only.

    The service records a ``user_activated`` audit entry.

    Raises:
        HTTPException 404: the target user does not exist.
    """
    target = _get_user_or_404(db, user_id)
    updated = user_service.activate_user(db, actor=current_user, target=target)
    return updated
