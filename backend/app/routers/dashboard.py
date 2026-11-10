"""Dashboard / reporting router (CONTRACT §5).

Mounted at ``/api/dashboard`` (the ``/api`` prefix is added by ``main.py``; this
router only declares the resource prefix).

All ticket-derived metrics are role-scoped: :mod:`app.services.dashboard_service`
builds its aggregates on top of ``ticket_service.visible_tickets_query`` so every
caller only sees numbers for tickets they are permitted to view (admin = all,
manager = department, support = assigned/unassigned, employee = own). The
``/support-performance`` report is a cross-agent view and is therefore restricted
to managers and admins.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies.auth import (
    get_current_user,
    get_db,
    require_manager_or_admin,
)
from app.models.user import User
from app.schemas.common import ChartPoint
from app.schemas.dashboard import DashboardStats, SupportPerformance
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get(
    "/stats",
    response_model=DashboardStats,
    summary="Headline ticket counters for the current user",
)
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return the role-scoped headline counters (totals, per-status, etc.).

    ``my_open_assigned`` is populated only for support users; for other roles it
    is omitted by the service and serialized as ``None``.
    """

    return dashboard_service.stats(db, current_user)


@router.get(
    "/tickets-by-status",
    response_model=List[ChartPoint],
    summary="Visible-ticket counts grouped by status",
)
def tickets_by_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[dict]:
    """Return ChartPoints of the current user's visible tickets, by status.

    Every status appears (zero-filled when absent) so the chart axis is stable.
    """

    return dashboard_service.tickets_by_status(db, current_user)


@router.get(
    "/tickets-by-priority",
    response_model=List[ChartPoint],
    summary="Visible-ticket counts grouped by priority",
)
def tickets_by_priority(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[dict]:
    """Return ChartPoints of the current user's visible tickets, by priority.

    Every priority appears (zero-filled when absent) so the chart axis is stable.
    """

    return dashboard_service.tickets_by_priority(db, current_user)


@router.get(
    "/tickets-by-category",
    response_model=List[ChartPoint],
    summary="Visible-ticket counts grouped by category",
)
def tickets_by_category(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[dict]:
    """Return ChartPoints of the current user's visible tickets, by category.

    Every category appears (zero-filled when absent) so the chart axis is stable.
    """

    return dashboard_service.tickets_by_category(db, current_user)


@router.get(
    "/support-performance",
    response_model=List[SupportPerformance],
    summary="Per-agent support performance (manager/admin only)",
)
def support_performance(
    db: Session = Depends(get_db),
    _manager_or_admin: User = Depends(require_manager_or_admin),
) -> List[dict]:
    """Return per-support-agent performance rows (manager/admin only).

    Cross-agent reporting view: number of tickets assigned, how many were
    resolved/closed, and the average resolution time in hours. Every support
    agent appears, even with zero assignments. Access is restricted to managers
    and admins via :data:`require_manager_or_admin`.
    """

    return dashboard_service.support_performance(db)
