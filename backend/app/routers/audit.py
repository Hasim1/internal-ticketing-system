"""Audit-log router (CONTRACT §5).

Mounted at ``/api/audit-logs`` (the ``/api`` prefix is added by ``main.py``; this
router only declares the resource prefix).

A single admin-only, paginated read endpoint exposes the system audit trail with
optional filtering by acting user, action type, entity type, and a creation-date
range. Each row nests the acting :class:`~app.schemas.user.UserBrief` (nullable
for system-originated actions). Results are newest-first.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.dependencies.auth import get_db, require_admin
from app.models.audit import AuditLog
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.common import PaginatedAuditLogs
from app.utils.pagination import (
    DEFAULT_PAGE,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    build_page,
    paginate,
)

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get(
    "/",
    response_model=PaginatedAuditLogs,
    summary="List audit-log entries (admin only)",
)
def list_audit_logs(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
    user_id: Optional[int] = Query(
        None,
        ge=1,
        description="Filter by the acting user's id.",
    ),
    action: Optional[AuditAction] = Query(
        None,
        description="Filter by audit action.",
    ),
    entity_type: Optional[str] = Query(
        None,
        min_length=1,
        max_length=50,
        description="Filter by affected entity type (e.g. 'ticket', 'user').",
    ),
    date_from: Optional[datetime] = Query(
        None,
        description="Only include entries created on/after this timestamp (inclusive).",
    ),
    date_to: Optional[datetime] = Query(
        None,
        description="Only include entries created on/before this timestamp (inclusive).",
    ),
    page: int = Query(DEFAULT_PAGE, ge=1, description="1-based page number."),
    page_size: int = Query(
        DEFAULT_PAGE_SIZE,
        ge=1,
        le=MAX_PAGE_SIZE,
        description="Items per page.",
    ),
) -> dict:
    """Return a paginated, newest-first slice of the audit trail.

    Admin-only (enforced by :data:`require_admin`). All filters are optional and
    combine with logical AND. ``user`` is eager-loaded to keep the nested
    serialization free of N+1 queries.
    """

    query = db.query(AuditLog).options(joinedload(AuditLog.user))

    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action is not None:
        query = query.filter(AuditLog.action == action)
    if entity_type is not None:
        query = query.filter(AuditLog.entity_type == entity_type)
    if date_from is not None:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to is not None:
        query = query.filter(AuditLog.created_at <= date_to)

    # Newest entries first; tie-break on id for a stable, deterministic order.
    query = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())

    items, total, _pages = paginate(query, page=page, page_size=page_size)
    return build_page(items, total=total, page=page, page_size=page_size)
