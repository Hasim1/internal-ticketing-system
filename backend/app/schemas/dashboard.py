"""Pydantic schemas for dashboard statistics and reports (CONTRACT §6)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class DashboardStats(BaseModel):
    """Aggregate ticket counts scoped to the requesting user's visibility.

    ``avg_resolution_hours`` is the mean hours between creation and resolution
    across resolved tickets in scope (``None`` when there are none).
    ``my_open_assigned`` is only meaningful for support users (``None`` for
    roles where it does not apply).
    """

    total_tickets: int
    open: int
    in_progress: int
    waiting_for_user: int
    resolved: int
    closed: int
    cancelled: int
    critical: int
    unassigned: int
    avg_resolution_hours: Optional[float] = None
    my_open_assigned: Optional[int] = None


class SupportPerformance(BaseModel):
    """Per-agent performance row for the support-performance report.

    ``avg_resolution_hours`` is the mean resolution time for tickets this agent
    resolved (``None`` when they have resolved none).
    """

    user_id: int
    full_name: str
    assigned: int
    resolved: int
    avg_resolution_hours: Optional[float] = None


__all__ = [
    "DashboardStats",
    "SupportPerformance",
]
