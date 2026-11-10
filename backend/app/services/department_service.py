"""Department CRUD business logic with audit logging.

Provides creation, retrieval (with user/ticket counts), updates, and a guarded
delete that refuses to remove a department still referenced by users or tickets.
The guard raises :class:`DepartmentInUseError` (a ``ValueError`` subclass) so the
router can translate it into an HTTP 409 without this layer depending on FastAPI.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.department import Department
from app.models.enums import AuditAction
from app.models.ticket import Ticket
from app.models.user import User
from app.services import audit_service

ENTITY_TYPE = "department"


class DepartmentInUseError(ValueError):
    """Raised when attempting to delete a department that still has dependents.

    The router catches this and responds with HTTP 409 Conflict.
    """


def list_departments(db: Session) -> list[Department]:
    """Return all departments ordered by name."""

    return db.query(Department).order_by(Department.name.asc()).all()


def get_department(db: Session, department_id: int) -> Optional[Department]:
    """Return a department by primary key, or ``None`` if not found."""

    return db.get(Department, department_id)


def get_department_by_name(db: Session, name: str) -> Optional[Department]:
    """Return a department by exact name, or ``None``."""

    return db.query(Department).filter(Department.name == name).first()


def user_count(db: Session, department_id: int) -> int:
    """Count users belonging to the given department."""

    return (
        db.query(func.count(User.id))
        .filter(User.department_id == department_id)
        .scalar()
        or 0
    )


def ticket_count(db: Session, department_id: int) -> int:
    """Count tickets routed to the given department."""

    return (
        db.query(func.count(Ticket.id))
        .filter(Ticket.department_id == department_id)
        .scalar()
        or 0
    )


def counts_for(db: Session, department_id: int) -> dict[str, int]:
    """Return ``{"user_count": int, "ticket_count": int}`` for a department.

    Convenience for routers that decorate a :class:`Department` with its
    dependent counts before serialization.
    """

    return {
        "user_count": user_count(db, department_id),
        "ticket_count": ticket_count(db, department_id),
    }


def create_department(db: Session, actor: User, data: dict) -> Department:
    """Create a department (admin action) and audit it.

    Args:
        db: Active session.
        actor: The admin performing the creation.
        data: Mapping with ``name`` and the optional ``description`` key.

    Returns:
        The persisted, refreshed :class:`Department`.
    """

    department = Department(
        name=data["name"],
        description=data.get("description"),
    )
    db.add(department)
    db.flush()

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.DEPARTMENT_CREATED,
        entity_type=ENTITY_TYPE,
        entity_id=department.id,
        old_value=None,
        new_value=department.name,
    )

    db.commit()
    db.refresh(department)
    return department


def update_department(
    db: Session,
    actor: User,
    department: Department,
    data: dict,
) -> Department:
    """Update a department's ``name`` / ``description`` and audit the change.

    Missing keys are ignored. A ``department_updated`` entry capturing the
    changed fields is written before commit.

    Returns:
        The updated, refreshed :class:`Department`.
    """

    changed: dict[str, object] = {}
    old_snapshot: dict[str, object] = {}

    for field in ("name", "description"):
        if field not in data:
            continue
        new_value = data[field]
        current = getattr(department, field)
        if new_value == current:
            continue
        old_snapshot[field] = current
        setattr(department, field, new_value)
        changed[field] = new_value

    if changed:
        audit_service.log_action(
            db,
            user_id=actor.id,
            action=AuditAction.DEPARTMENT_UPDATED,
            entity_type=ENTITY_TYPE,
            entity_id=department.id,
            old_value=old_snapshot,
            new_value=changed,
        )

    db.commit()
    db.refresh(department)
    return department


def delete_department(db: Session, actor: User, department: Department) -> None:
    """Delete a department, refusing if it still has users or tickets.

    Raises:
        DepartmentInUseError: if any user or ticket references the department.

    A ``department_deleted`` audit entry is written before the row is removed.
    """

    if user_count(db, department.id) > 0 or ticket_count(db, department.id) > 0:
        raise DepartmentInUseError(
            "Department has associated users or tickets and cannot be deleted."
        )

    department_id = department.id
    name = department.name

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.DEPARTMENT_DELETED,
        entity_type=ENTITY_TYPE,
        entity_id=department_id,
        old_value=name,
        new_value=None,
    )

    db.delete(department)
    db.commit()
