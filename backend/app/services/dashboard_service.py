"""Dashboard / reporting aggregations.

All ticket-scoped metrics reuse :func:`ticket_service.visible_tickets_query` so a
user only ever sees aggregates over tickets they are permitted to view (admin =
all, manager = department, support = assigned/unassigned, employee = own).

Returned shapes (CONTRACT §5):

* :func:`stats` -> ``dict`` matching ``DashboardStats``.
* :func:`tickets_by_status` / ``_priority`` / ``_category`` ->
  ``list[{"label": str, "value": int}]`` (``ChartPoint``).
* :func:`support_performance` -> ``list`` of ``SupportPerformance`` dicts.

Average resolution time is computed in hours from ``resolved_at - created_at``
over tickets that have been resolved or closed.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.enums import TicketCategory, TicketPriority, TicketStatus, UserRole
from app.models.ticket import Ticket
from app.models.user import User
from app.services import ticket_service


def _seconds_to_hours(seconds: Optional[float]) -> float:
    """Convert a seconds count to hours, rounded to two decimals (``0.0`` if None)."""

    if not seconds:
        return 0.0
    return round(seconds / 3600.0, 2)


def _resolution_seconds_expr():
    """SQL expression for a ticket's resolution duration in seconds.

    Uses ``resolved_at`` when present, otherwise falls back to ``closed_at`` (a
    ticket may be closed directly without an explicit resolved step). Returns the
    epoch-second delta from ``created_at`` to that completion timestamp.
    """

    completion = func.coalesce(Ticket.resolved_at, Ticket.closed_at)
    # ``extract('epoch', interval)`` yields the interval length in seconds and is
    # portable across PostgreSQL (the deployment DB) for timestamptz subtraction.
    return func.extract("epoch", completion - Ticket.created_at)


def avg_resolution_hours(db: Session, user: User) -> float:
    """Average resolution time (hours) over the user's resolved/closed tickets.

    Only tickets in ``resolved`` or ``closed`` state with a usable completion
    timestamp contribute. Returns ``0.0`` when there are none.
    """

    query = (
        ticket_service.visible_tickets_query(db, user)
        .filter(
            Ticket.status.in_([TicketStatus.RESOLVED, TicketStatus.CLOSED]),
            func.coalesce(Ticket.resolved_at, Ticket.closed_at).isnot(None),
        )
        .with_entities(func.avg(_resolution_seconds_expr()))
    )
    avg_seconds = query.scalar()
    return _seconds_to_hours(float(avg_seconds) if avg_seconds is not None else None)


def stats(db: Session, user: User) -> dict:
    """Compute the headline dashboard counters for ``user``.

    Returns a mapping matching ``DashboardStats``: total plus a per-status
    breakdown, a ``critical`` count, an ``unassigned`` count, the average
    resolution time in hours, and — for support users — the count of open tickets
    currently assigned to them (``my_open_assigned``).
    """

    visible = ticket_service.visible_tickets_query(db, user)

    # Single aggregate pass over the visible set for the status/priority counters.
    def _count(*conditions) -> int:
        scoped = ticket_service.visible_tickets_query(db, user)
        for condition in conditions:
            scoped = scoped.filter(condition)
        return scoped.count()

    result: dict[str, object] = {
        "total_tickets": visible.count(),
        "open": _count(Ticket.status == TicketStatus.OPEN),
        "in_progress": _count(Ticket.status == TicketStatus.IN_PROGRESS),
        "waiting_for_user": _count(Ticket.status == TicketStatus.WAITING_FOR_USER),
        "resolved": _count(Ticket.status == TicketStatus.RESOLVED),
        "closed": _count(Ticket.status == TicketStatus.CLOSED),
        "cancelled": _count(Ticket.status == TicketStatus.CANCELLED),
        "critical": _count(Ticket.priority == TicketPriority.CRITICAL),
        "unassigned": _count(Ticket.assigned_to_id.is_(None)),
        "avg_resolution_hours": avg_resolution_hours(db, user),
    }

    # Support-specific: how many active (open/in-progress) tickets are mine.
    if user.role == UserRole.SUPPORT:
        result["my_open_assigned"] = _count(
            Ticket.assigned_to_id == user.id,
            Ticket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]),
        )

    return result


def _grouped_counts(
    db: Session,
    user: User,
    column,
    all_values: list,
) -> list[dict]:
    """Group the visible tickets by ``column`` and return ChartPoint dicts.

    Every member of ``all_values`` appears in the output (zero-filled if absent)
    so the frontend renders a stable, complete axis. ``label`` uses the enum's
    string value.
    """

    rows = (
        ticket_service.visible_tickets_query(db, user)
        .with_entities(column, func.count(Ticket.id))
        .group_by(column)
        .all()
    )
    counts: dict[str, int] = {}
    for value, count in rows:
        key = getattr(value, "value", value)
        counts[str(key)] = int(count)

    points: list[dict] = []
    for member in all_values:
        label = getattr(member, "value", member)
        points.append({"label": str(label), "value": counts.get(str(label), 0)})
    return points


def tickets_by_status(db: Session, user: User) -> list[dict]:
    """ChartPoints of visible-ticket counts grouped by status."""

    return _grouped_counts(db, user, Ticket.status, list(TicketStatus))


def tickets_by_priority(db: Session, user: User) -> list[dict]:
    """ChartPoints of visible-ticket counts grouped by priority."""

    return _grouped_counts(db, user, Ticket.priority, list(TicketPriority))


def tickets_by_category(db: Session, user: User) -> list[dict]:
    """ChartPoints of visible-ticket counts grouped by category."""

    return _grouped_counts(db, user, Ticket.category, list(TicketCategory))


def support_performance(db: Session) -> list[dict]:
    """Per-support-agent performance metrics (manager/admin reporting view).

    For every user with the ``support`` role, returns the number of tickets
    assigned to them, how many of those reached ``resolved``/``closed``, and the
    average resolution time (hours) over that resolved set. Agents with no
    assignments still appear (with zeroes) so the report is complete.

    This view is intentionally global (not visibility-scoped): it is restricted
    to manager/admin callers at the router layer.
    """

    support_users: list[User] = (
        db.query(User)
        .filter(User.role == UserRole.SUPPORT)
        .order_by(User.full_name.asc())
        .all()
    )

    results: list[dict] = []
    for agent in support_users:
        assigned = (
            db.query(func.count(Ticket.id))
            .filter(Ticket.assigned_to_id == agent.id)
            .scalar()
            or 0
        )
        resolved = (
            db.query(func.count(Ticket.id))
            .filter(
                Ticket.assigned_to_id == agent.id,
                Ticket.status.in_([TicketStatus.RESOLVED, TicketStatus.CLOSED]),
            )
            .scalar()
            or 0
        )
        avg_seconds = (
            db.query(func.avg(_resolution_seconds_expr()))
            .filter(
                Ticket.assigned_to_id == agent.id,
                Ticket.status.in_([TicketStatus.RESOLVED, TicketStatus.CLOSED]),
                func.coalesce(Ticket.resolved_at, Ticket.closed_at).isnot(None),
            )
            .scalar()
        )
        results.append(
            {
                "user_id": agent.id,
                "full_name": agent.full_name,
                "assigned": int(assigned),
                "resolved": int(resolved),
                "avg_resolution_hours": _seconds_to_hours(
                    float(avg_seconds) if avg_seconds is not None else None
                ),
            }
        )

    return results
