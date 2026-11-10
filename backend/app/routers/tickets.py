"""Ticket endpoints (CONTRACT §5).

All endpoints are authenticated. RBAC visibility is enforced via
:func:`app.services.ticket_service.visible_tickets_query`: the list endpoint
builds on the visibility query before applying filters/sort/pagination, and every
single-ticket endpoint resolves the target through the same visibility query so a
user can never read or mutate a ticket they are not allowed to see (404 when not
visible, matching the contract).

Mutations are delegated to :mod:`app.services.ticket_service`, which owns the
status-history and audit side effects and the transaction boundary. The router is
responsible only for authorization (who may perform each action) and for
translating service outcomes into HTTP responses.

Router prefix is the resource prefix only (``/tickets``); ``main.py`` mounts every
router under ``settings.API_V1_PREFIX`` (``/api``), yielding final paths such as
``/api/tickets``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user, get_db, require_admin
from app.models.enums import (
    TicketCategory,
    TicketPriority,
    TicketStatus,
    UserRole,
)
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.common import PaginatedTickets
from app.schemas.ticket import (
    AssignRequest,
    PriorityUpdate,
    StatusUpdate,
    TicketCreate,
    TicketRead,
    TicketUpdate,
)
from app.services import ticket_service, user_service
from app.utils.pagination import build_page, paginate

router = APIRouter(prefix="/tickets", tags=["tickets"])

# Roles that may freely edit / re-prioritize / arbitrarily transition tickets.
_STAFF_ROLES = {UserRole.SUPPORT, UserRole.MANAGER, UserRole.ADMIN}

# Columns the client may sort by. Keys are the public sort field names; the sort
# string is ``field`` (ascending) or ``-field`` (descending), defaulting to
# ``-created_at``.
_SORTABLE_COLUMNS = {
    "created_at": Ticket.created_at,
    "updated_at": Ticket.updated_at,
    "priority": Ticket.priority,
    "status": Ticket.status,
    "title": Ticket.title,
    "id": Ticket.id,
}


def _get_visible_ticket(db: Session, user: User, ticket_id: int) -> Ticket:
    """Resolve a ticket the user is allowed to see, or raise 404.

    Visibility is enforced by reusing the same query builder as the list
    endpoint, so the single-ticket access rules can never drift from the list
    rules. A ticket that exists but is not visible to the requester is reported
    as 404 (not 403) so its existence is not leaked.
    """

    ticket = (
        ticket_service.visible_tickets_query(db, user)
        .filter(Ticket.id == ticket_id)
        .first()
    )
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )
    return ticket


def _apply_sort(query, sort: str):
    """Apply a ``sort`` directive (e.g. ``-created_at``) to a ticket query.

    Unknown sort fields fall back to the contract default of ``-created_at`` so a
    malformed query parameter never raises; the descending/ascending direction is
    taken from a leading ``-``.
    """

    field = sort or "-created_at"
    descending = field.startswith("-")
    key = field[1:] if descending else field

    column = _SORTABLE_COLUMNS.get(key)
    if column is None:
        # Fall back to the contract default ordering.
        column = Ticket.created_at
        descending = True

    return query.order_by(column.desc() if descending else column.asc())


@router.get("", response_model=PaginatedTickets)
def list_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: Optional[TicketStatus] = Query(default=None, alias="status"),
    priority: Optional[TicketPriority] = Query(default=None),
    category: Optional[TicketCategory] = Query(default=None),
    department_id: Optional[int] = Query(default=None),
    assigned_to_id: Optional[int] = Query(default=None),
    created_by_id: Optional[int] = Query(default=None),
    search: Optional[str] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    sort: str = Query(default="-created_at"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedTickets:
    """List tickets visible to the current user, filtered/sorted/paginated.

    Visibility is applied first (RBAC), then the optional filters, then sorting
    and pagination. ``search`` matches case-insensitively against the ticket
    title or description. ``date_from`` / ``date_to`` bound ``created_at``.
    """

    query = ticket_service.visible_tickets_query(db, current_user)

    if status_filter is not None:
        query = query.filter(Ticket.status == status_filter)
    if priority is not None:
        query = query.filter(Ticket.priority == priority)
    if category is not None:
        query = query.filter(Ticket.category == category)
    if department_id is not None:
        query = query.filter(Ticket.department_id == department_id)
    if assigned_to_id is not None:
        query = query.filter(Ticket.assigned_to_id == assigned_to_id)
    if created_by_id is not None:
        query = query.filter(Ticket.created_by_id == created_by_id)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Ticket.title.ilike(pattern),
                Ticket.description.ilike(pattern),
            )
        )
    if date_from is not None:
        query = query.filter(Ticket.created_at >= date_from)
    if date_to is not None:
        query = query.filter(Ticket.created_at <= date_to)

    query = _apply_sort(query, sort)

    items, total, _pages = paginate(query, page=page, page_size=page_size)
    return build_page(items, total, page=page, page_size=page_size)


@router.get("/{ticket_id}", response_model=TicketRead)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    """Fetch a single ticket, enforcing RBAC visibility (404 if not visible)."""

    return _get_visible_ticket(db, current_user, ticket_id)


@router.post("", response_model=TicketRead, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    """Create a ticket owned by the current user.

    The ticket starts ``open``; the service writes the initial status-history row
    (``None`` -> ``open``) and a ``ticket_created`` audit entry.
    """

    return ticket_service.create_ticket(
        db,
        user=current_user,
        data=payload.model_dump(),
    )


@router.put("/{ticket_id}", response_model=TicketRead)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    """Edit a ticket's core fields.

    Permitted for support/manager/admin at any time, or for the ticket's creator
    while it is still ``open``. Other actors receive 403.
    """

    ticket = _get_visible_ticket(db, current_user, ticket_id)

    is_staff = current_user.role in _STAFF_ROLES
    is_creator = ticket.created_by_id == current_user.id
    creator_may_edit = is_creator and ticket.status == TicketStatus.OPEN

    if not (is_staff or creator_may_edit):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this ticket",
        )

    data = payload.model_dump(exclude_unset=True)
    return ticket_service.update_ticket(
        db,
        actor=current_user,
        ticket=ticket,
        data=data,
    )


@router.patch("/{ticket_id}/assign", response_model=TicketRead)
def assign_ticket(
    ticket_id: int,
    payload: AssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    """Assign (or unassign) a ticket.

    Authorization:

    * **support** — may only self-assign (``assigned_to_id == me``); may not
      unassign or assign to others.
    * **manager / admin** — may assign to any active *support* user, or unassign
      (``assigned_to_id is None``).
    * **employee** — never permitted (403).

    Assigning an ``open`` ticket auto-transitions it to ``in_progress`` (handled
    in the service).
    """

    ticket = _get_visible_ticket(db, current_user, ticket_id)
    target_id = payload.assigned_to_id
    role = current_user.role

    if role == UserRole.SUPPORT:
        # Support staff may only self-assign; unassigning or assigning others is
        # reserved for managers/admins.
        if target_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Support users may only assign tickets to themselves",
            )
    elif role in {UserRole.MANAGER, UserRole.ADMIN}:
        # Managers/admins may assign to any support user, or unassign.
        if target_id is not None:
            target = user_service.get_user(db, target_id)
            if target is None or not target.is_active:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Assignee not found",
                )
            if target.role != UserRole.SUPPORT:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tickets can only be assigned to support users",
                )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to assign tickets",
        )

    return ticket_service.assign_ticket(
        db,
        actor=current_user,
        ticket=ticket,
        assigned_to_id=target_id,
    )


@router.patch("/{ticket_id}/status", response_model=TicketRead)
def change_ticket_status(
    ticket_id: int,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    """Change a ticket's status, writing status-history + audit (in the service).

    Authorization:

    * **support / manager / admin** — any transition.
    * **employee (creator only)** — may ``close`` a ticket only from ``resolved``,
      or ``cancel`` it only from ``open``. Any other transition is 403.
    """

    ticket = _get_visible_ticket(db, current_user, ticket_id)
    new_status = payload.status

    if current_user.role not in _STAFF_ROLES:
        # Employees: only the creator, and only the two contract-permitted moves.
        is_creator = ticket.created_by_id == current_user.id
        close_from_resolved = (
            new_status == TicketStatus.CLOSED
            and ticket.status == TicketStatus.RESOLVED
        )
        cancel_from_open = (
            new_status == TicketStatus.CANCELLED
            and ticket.status == TicketStatus.OPEN
        )
        if not (is_creator and (close_from_resolved or cancel_from_open)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to make this status change",
            )

    return ticket_service.change_status(
        db,
        actor=current_user,
        ticket=ticket,
        new_status=new_status,
    )


@router.patch("/{ticket_id}/priority", response_model=TicketRead)
def change_ticket_priority(
    ticket_id: int,
    payload: PriorityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    """Change a ticket's priority (support/manager/admin only)."""

    ticket = _get_visible_ticket(db, current_user, ticket_id)

    if current_user.role not in _STAFF_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to change ticket priority",
        )

    return ticket_service.change_priority(
        db,
        actor=current_user,
        ticket=ticket,
        new_priority=payload.priority,
    )


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Response:
    """Delete a ticket (admin only). Returns 204; 404 if it does not exist."""

    # Admins can see every ticket, so the visibility query also serves as the
    # existence check here.
    ticket = _get_visible_ticket(db, current_user, ticket_id)
    ticket_service.delete_ticket(db, actor=current_user, ticket=ticket)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
