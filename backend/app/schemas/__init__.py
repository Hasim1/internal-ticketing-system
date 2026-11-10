"""Pydantic v2 schema package.

Re-exports every request/response schema so callers can do
``from app.schemas import UserRead, TicketCreate, PaginatedTickets`` etc.

Import order matters here: leaf schemas (department, user) are imported before
schemas that embed them (ticket, comment, audit, auth), and the pagination
envelopes in ``common`` are imported last because they reference the concrete
read models.
"""

from __future__ import annotations

from app.schemas.department import (
    DepartmentBrief,
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
)
from app.schemas.user import (
    RoleUpdate,
    UserBrief,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.ticket import (
    AssignRequest,
    PriorityUpdate,
    StatusUpdate,
    TicketCreate,
    TicketRead,
    TicketUpdate,
)
from app.schemas.comment import (
    CommentCreate,
    CommentRead,
)
from app.schemas.audit import AuditLogRead
from app.schemas.dashboard import (
    DashboardStats,
    SupportPerformance,
)
from app.schemas.common import (
    ChartPoint,
    PaginatedAuditLogs,
    PaginatedResponse,
    PaginatedTickets,
    PaginatedUsers,
)

__all__ = [
    # department
    "DepartmentBrief",
    "DepartmentRead",
    "DepartmentCreate",
    "DepartmentUpdate",
    # user
    "UserBrief",
    "UserRead",
    "UserCreate",
    "UserUpdate",
    "RoleUpdate",
    # auth
    "RegisterRequest",
    "LoginRequest",
    "TokenResponse",
    # ticket
    "TicketRead",
    "TicketCreate",
    "TicketUpdate",
    "AssignRequest",
    "StatusUpdate",
    "PriorityUpdate",
    # comment
    "CommentRead",
    "CommentCreate",
    # audit
    "AuditLogRead",
    # dashboard
    "DashboardStats",
    "SupportPerformance",
    # common / pagination
    "ChartPoint",
    "PaginatedResponse",
    "PaginatedUsers",
    "PaginatedTickets",
    "PaginatedAuditLogs",
]
