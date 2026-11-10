"""Ticket comments router (CONTRACT §5).

Mounted at ``/api/tickets/{ticket_id}/comments`` (the ``/api`` prefix is added by
``main.py``; this router only declares the resource prefix).

Every endpoint is nested under a ticket and gated by the same visibility rules as
the tickets API: a requester may only read or comment on a ticket returned by
:func:`ticket_service.visible_tickets_query`. If the ticket either does not exist
or is not visible to the requester, both endpoints return ``404`` (so visibility
boundaries are not leaked via a ``403``).

Internal comments (``is_internal=True``) are restricted to support/manager/admin
staff: employees never *see* them on read, and any ``is_internal`` flag they send
on create is forced to ``False``.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user, get_db
from app.models.comment import TicketComment
from app.models.enums import AuditAction, UserRole
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentRead
from app.services import audit_service, ticket_service

router = APIRouter(prefix="/tickets/{ticket_id}/comments", tags=["comments"])

ENTITY_TYPE = "comment"


def _get_visible_ticket(db: Session, ticket_id: int, user: User) -> Ticket:
    """Return a ticket the ``user`` is allowed to see, or raise ``404``.

    Reuses :func:`ticket_service.visible_tickets_query` so comment visibility
    exactly tracks ticket visibility. A non-existent *or* invisible ticket yields
    an identical ``404`` to avoid disclosing the existence of tickets outside the
    requester's scope.
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


@router.get(
    "/",
    response_model=List[CommentRead],
    summary="List comments on a ticket",
)
def list_comments(
    ticket_id: int = Path(..., ge=1, description="Parent ticket id"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[TicketComment]:
    """List the comments on a ticket the requester can see.

    Comments are returned oldest-first (by ``created_at``). Employees never
    receive internal comments; support/manager/admin receive all of them.
    """

    _get_visible_ticket(db, ticket_id, current_user)

    query = (
        db.query(TicketComment)
        .filter(TicketComment.ticket_id == ticket_id)
        .order_by(TicketComment.created_at.asc(), TicketComment.id.asc())
    )

    # Employees must never see internal staff notes.
    if current_user.role == UserRole.EMPLOYEE:
        query = query.filter(TicketComment.is_internal.is_(False))

    return query.all()


@router.post(
    "/",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment to a ticket",
)
def create_comment(
    payload: CommentCreate,
    ticket_id: int = Path(..., ge=1, description="Parent ticket id"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketComment:
    """Post a comment on a ticket the requester can see.

    Employees may only post public comments: any ``is_internal=True`` they send is
    coerced to ``False``. A ``comment_added`` audit entry is written before the
    commit so the comment and its audit row land atomically.
    """

    _get_visible_ticket(db, ticket_id, current_user)

    # Employees cannot author internal comments; force the flag off for them.
    is_internal = payload.is_internal
    if current_user.role == UserRole.EMPLOYEE:
        is_internal = False

    comment = TicketComment(
        ticket_id=ticket_id,
        user_id=current_user.id,
        comment=payload.comment,
        is_internal=is_internal,
    )
    db.add(comment)
    # Flush so the comment obtains its primary key for the audit entity_id below.
    db.flush()

    audit_service.log_action(
        db,
        user_id=current_user.id,
        action=AuditAction.COMMENT_ADDED,
        entity_type=ENTITY_TYPE,
        entity_id=comment.id,
        old_value=None,
        new_value=ticket_id,
    )

    db.commit()
    db.refresh(comment)
    return comment
