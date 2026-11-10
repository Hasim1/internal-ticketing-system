"""Ticket business logic: RBAC visibility plus all mutating workflows.

Routers stay thin and delegate here. Every mutating helper writes the relevant
audit log (and, where applicable, a status-history row) **before** committing,
so the side effects land atomically with the ticket change. Each mutating helper
commits, refreshes, and returns the :class:`Ticket` ORM model; the router then
serializes it with the appropriate ``response_model``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from app.models.enums import AuditAction, TicketPriority, TicketStatus, UserRole
from app.models.status_history import TicketStatusHistory
from app.models.ticket import Ticket
from app.models.user import User
from app.services import audit_service

ENTITY_TYPE = "ticket"


def _now() -> datetime:
    """Return the current timezone-aware UTC timestamp."""

    return datetime.now(timezone.utc)


def visible_tickets_query(db: Session, user: User) -> Query:
    """Build a :class:`Query` over tickets the given user is allowed to see.

    RBAC visibility (CONTRACT §5):

    * **admin** — every ticket.
    * **manager** — tickets in the manager's own department, plus any ticket the
      manager created.
    * **support** — tickets assigned to the support user, unassigned tickets, and
      tickets the support user created.
    * **employee** — only tickets the employee created.

    The returned query is unordered and unfiltered beyond visibility, so callers
    may further filter, sort, and paginate it.
    """

    query = db.query(Ticket)
    role = user.role

    if role == UserRole.ADMIN:
        return query

    if role == UserRole.MANAGER:
        return query.filter(
            or_(
                Ticket.department_id == user.department_id,
                Ticket.created_by_id == user.id,
            )
        )

    if role == UserRole.SUPPORT:
        return query.filter(
            or_(
                Ticket.assigned_to_id == user.id,
                Ticket.assigned_to_id.is_(None),
                Ticket.created_by_id == user.id,
            )
        )

    # Default / employee: only their own tickets.
    return query.filter(Ticket.created_by_id == user.id)


def get_ticket(db: Session, ticket_id: int) -> Optional[Ticket]:
    """Fetch a ticket by id, or ``None`` if it does not exist.

    Visibility is **not** enforced here; callers combine this with
    :func:`visible_tickets_query` (or an explicit permission check) to decide
    whether the requesting user may see the result.
    """

    return db.get(Ticket, ticket_id)


def create_ticket(db: Session, user: User, data: dict) -> Ticket:
    """Create a new ticket owned by ``user``.

    The ticket always starts in :attr:`TicketStatus.OPEN`. A status-history row
    (``None`` -> ``open``) and a ``ticket_created`` audit entry are written before
    the commit.

    Args:
        db: Active session.
        user: The creator; becomes ``created_by``.
        data: Mapping with ``title``, ``description``, ``category`` and the
            optional ``priority`` and ``department_id`` keys.

    Returns:
        The persisted, refreshed :class:`Ticket`.
    """

    ticket = Ticket(
        title=data["title"],
        description=data["description"],
        category=data["category"],
        priority=data.get("priority") or TicketPriority.MEDIUM,
        status=TicketStatus.OPEN,
        created_by_id=user.id,
        department_id=data.get("department_id"),
    )
    db.add(ticket)
    # Flush to obtain ticket.id for the dependent history / audit rows.
    db.flush()

    db.add(
        TicketStatusHistory(
            ticket_id=ticket.id,
            changed_by_id=user.id,
            old_status=None,
            new_status=TicketStatus.OPEN,
        )
    )

    audit_service.log_action(
        db,
        user_id=user.id,
        action=AuditAction.TICKET_CREATED,
        entity_type=ENTITY_TYPE,
        entity_id=ticket.id,
        old_value=None,
        new_value=ticket.title,
    )

    db.commit()
    db.refresh(ticket)
    return ticket


def update_ticket(db: Session, actor: User, ticket: Ticket, data: dict) -> Ticket:
    """Apply editable-field changes to a ticket and audit them.

    Only the contract-editable fields are touched: ``title``, ``description``,
    ``category`` and ``department_id``. Keys absent from ``data`` are left
    unchanged. A ``ticket_updated`` audit entry capturing the changed field names
    is written before commit.

    Args:
        db: Active session.
        actor: The user performing the edit.
        ticket: The ticket to mutate (already loaded).
        data: Mapping of the fields above; missing keys are ignored.

    Returns:
        The updated, refreshed :class:`Ticket`.
    """

    editable = ("title", "description", "category", "department_id")
    changed: list[str] = []
    old_snapshot: dict[str, object] = {}

    for field in editable:
        if field not in data:
            continue
        new_value = data[field]
        current = getattr(ticket, field)
        if new_value == current:
            continue
        old_snapshot[field] = current
        setattr(ticket, field, new_value)
        changed.append(field)

    if changed:
        audit_service.log_action(
            db,
            user_id=actor.id,
            action=AuditAction.TICKET_UPDATED,
            entity_type=ENTITY_TYPE,
            entity_id=ticket.id,
            old_value=old_snapshot,
            new_value={field: data[field] for field in changed},
        )

    db.commit()
    db.refresh(ticket)
    return ticket


def assign_ticket(
    db: Session,
    actor: User,
    ticket: Ticket,
    assigned_to_id: Optional[int],
) -> Ticket:
    """Assign (or unassign) a ticket and audit the change.

    Assigning an ``open`` ticket automatically transitions it to
    ``in_progress`` and records the accompanying status-history row. Passing
    ``assigned_to_id=None`` unassigns the ticket without altering its status.
    A ``ticket_assigned`` audit entry is always written.

    Args:
        db: Active session.
        actor: The user performing the assignment.
        ticket: The ticket to mutate.
        assigned_to_id: The target assignee's user id, or ``None`` to unassign.

    Returns:
        The updated, refreshed :class:`Ticket`.
    """

    old_assignee = ticket.assigned_to_id
    ticket.assigned_to_id = assigned_to_id

    # Auto-advance an untouched ticket into active work on first assignment.
    if assigned_to_id is not None and ticket.status == TicketStatus.OPEN:
        old_status = ticket.status
        ticket.status = TicketStatus.IN_PROGRESS
        db.add(
            TicketStatusHistory(
                ticket_id=ticket.id,
                changed_by_id=actor.id,
                old_status=old_status,
                new_status=TicketStatus.IN_PROGRESS,
            )
        )

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.TICKET_ASSIGNED,
        entity_type=ENTITY_TYPE,
        entity_id=ticket.id,
        old_value=old_assignee,
        new_value=assigned_to_id,
    )

    db.commit()
    db.refresh(ticket)
    return ticket


def change_status(
    db: Session,
    actor: User,
    ticket: Ticket,
    new_status: TicketStatus,
) -> Ticket:
    """Transition a ticket to ``new_status`` with history + audit side effects.

    Writes a :class:`TicketStatusHistory` row capturing the (old -> new)
    transition, sets ``resolved_at`` when moving to ``resolved`` and ``closed_at``
    when moving to ``closed``, and records a ``status_changed`` audit entry. The
    timestamps are only stamped on the *first* transition into those states.

    Args:
        db: Active session.
        actor: The user performing the transition.
        ticket: The ticket to mutate.
        new_status: The target :class:`TicketStatus`.

    Returns:
        The updated, refreshed :class:`Ticket`.
    """

    old_status = ticket.status
    ticket.status = new_status

    if new_status == TicketStatus.RESOLVED and ticket.resolved_at is None:
        ticket.resolved_at = _now()
    if new_status == TicketStatus.CLOSED and ticket.closed_at is None:
        ticket.closed_at = _now()

    db.add(
        TicketStatusHistory(
            ticket_id=ticket.id,
            changed_by_id=actor.id,
            old_status=old_status,
            new_status=new_status,
        )
    )

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.STATUS_CHANGED,
        entity_type=ENTITY_TYPE,
        entity_id=ticket.id,
        old_value=old_status,
        new_value=new_status,
    )

    db.commit()
    db.refresh(ticket)
    return ticket


def change_priority(
    db: Session,
    actor: User,
    ticket: Ticket,
    new_priority: TicketPriority,
) -> Ticket:
    """Change a ticket's priority and write a ``priority_changed`` audit entry.

    Args:
        db: Active session.
        actor: The user performing the change.
        ticket: The ticket to mutate.
        new_priority: The target :class:`TicketPriority`.

    Returns:
        The updated, refreshed :class:`Ticket`.
    """

    old_priority = ticket.priority
    ticket.priority = new_priority

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.PRIORITY_CHANGED,
        entity_type=ENTITY_TYPE,
        entity_id=ticket.id,
        old_value=old_priority,
        new_value=new_priority,
    )

    db.commit()
    db.refresh(ticket)
    return ticket


def delete_ticket(db: Session, actor: User, ticket: Ticket) -> None:
    """Delete a ticket and record a ``ticket_deleted`` audit entry.

    Cascade rules on the ORM relationships remove dependent comments and
    status-history rows. The audit entry is captured before deletion so the trail
    survives.

    Args:
        db: Active session.
        actor: The (admin) user performing the deletion.
        ticket: The ticket to delete.
    """

    ticket_id = ticket.id
    title = ticket.title

    audit_service.log_action(
        db,
        user_id=actor.id,
        action=AuditAction.TICKET_DELETED,
        entity_type=ENTITY_TYPE,
        entity_id=ticket_id,
        old_value=title,
        new_value=None,
    )

    db.delete(ticket)
    db.commit()
