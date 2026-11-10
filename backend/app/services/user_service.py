"""User management business logic.

Covers listing (with role-scoped visibility for managers), retrieval, creation,
profile updates, role changes, and (de)activation. All mutating helpers write an
audit entry before committing and return the refreshed :class:`User` model.

Password hashing is delegated to :mod:`app.core.security`.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from app.core.security import hash_password
from app.models.enums import AuditAction, UserRole
from app.models.user import User
from app.services import audit_service

ENTITY_TYPE = "user"


def visible_users_query(db: Session, user: User) -> Query:
    """Build a :class:`Query` over users the requester may list.

    * **admin** — every user.
    * **manager** — only users in the manager's own department.

    Lower roles are not expected to reach the user-listing endpoint (the router
    enforces admin/manager access); for safety they are scoped to themselves.
    """

    query = db.query(User)

    if user.role == UserRole.ADMIN:
        return query

    if user.role == UserRole.MANAGER:
        return query.filter(User.department_id == user.department_id)

    return query.filter(User.id == user.id)


def get_user(db: Session, user_id: int) -> Optional[User]:
    """Return a user by primary key, or ``None`` if not found."""

    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Return a user by email (case-sensitive match), or ``None``."""

    return db.query(User).filter(User.email == email).first()


def apply_user_filters(
    query: Query,
    *,
    role: Optional[UserRole] = None,
    department_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
) -> Query:
    """Apply optional list filters to a (already visibility-scoped) user query.

    ``search`` matches case-insensitively against full name or email.
    """

    if role is not None:
        query = query.filter(User.role == role)
    if department_id is not None:
        query = query.filter(User.department_id == department_id)
    if is_active is not None:
        query = query.filter(User.is_active.is_(is_active))
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(User.full_name.ilike(pattern), User.email.ilike(pattern))
        )
    return query


def create_user(db: Session, actor: User, data: dict) -> User:
    """Create a new user (admin action) and audit it.

    Args:
        db: Active session.
        actor: The admin performing the creation.
        data: Mapping with ``full_name``, ``email``, ``password``, ``role`` and
            the optional ``department_id`` / ``is_active`` keys.

    Returns:
        The persisted, refreshed :class:`User`.
    """

    new_user = User(
        full_name=data["full_name"],
        email=data["email"],
        hashed_password=hash_password(data["password"]),
        role=data.get("role") or UserRole.EMPLOYEE,
        department_id=data.get("department_id"),
        is_active=data.get("is_active", True),
    )
    db.add(new_user)
    db.flush()

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.USER_CREATED,
        entity_type=ENTITY_TYPE,
        entity_id=new_user.id,
        old_value=None,
        new_value=new_user.email,
    )

    db.commit()
    db.refresh(new_user)
    return new_user


def update_user(db: Session, actor: User, target: User, data: dict) -> User:
    """Update a user's editable profile fields.

    Only ``full_name``, ``email`` and ``department_id`` are editable here (per
    CONTRACT §5). Role and active-state changes go through their dedicated
    helpers. No dedicated audit action exists for a plain profile update in the
    contract, so none is written; the ORM stamps ``updated_at`` automatically.

    Args:
        db: Active session.
        actor: The admin performing the edit (reserved for future auditing).
        target: The user being edited.
        data: Mapping of the editable fields; missing keys are ignored.

    Returns:
        The updated, refreshed :class:`User`.
    """

    for field in ("full_name", "email", "department_id"):
        if field in data and data[field] is not None:
            setattr(target, field, data[field])

    db.commit()
    db.refresh(target)
    return target


def change_role(db: Session, actor: User, target: User, new_role: UserRole) -> User:
    """Change a user's role and audit the old/new values.

    Args:
        db: Active session.
        actor: The admin performing the change.
        target: The user whose role changes.
        new_role: The new :class:`UserRole`.

    Returns:
        The updated, refreshed :class:`User`.
    """

    old_role = target.role
    target.role = new_role

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.USER_ROLE_CHANGED,
        entity_type=ENTITY_TYPE,
        entity_id=target.id,
        old_value=old_role,
        new_value=new_role,
    )

    db.commit()
    db.refresh(target)
    return target


def deactivate_user(db: Session, actor: User, target: User) -> User:
    """Mark a user inactive and audit a ``user_deactivated`` entry.

    The router is responsible for preventing an admin from deactivating
    themselves; this helper performs the state change unconditionally.

    Returns:
        The updated, refreshed :class:`User`.
    """

    target.is_active = False

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.USER_DEACTIVATED,
        entity_type=ENTITY_TYPE,
        entity_id=target.id,
        old_value=True,
        new_value=False,
    )

    db.commit()
    db.refresh(target)
    return target


def activate_user(db: Session, actor: User, target: User) -> User:
    """Mark a user active and audit a ``user_activated`` entry.

    Returns:
        The updated, refreshed :class:`User`.
    """

    target.is_active = True

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.USER_ACTIVATED,
        entity_type=ENTITY_TYPE,
        entity_id=target.id,
        old_value=False,
        new_value=True,
    )

    db.commit()
    db.refresh(target)
    return target
