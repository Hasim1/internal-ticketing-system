"""Enumeration types shared across the data model, API layer, and frontend.

Each class subclasses ``(str, Enum)`` so that the member *values* are the exact
lowercase strings defined in CONTRACT §2. These strings are what gets persisted
to the database, serialized over the API, and mirrored by the frontend in
``frontend/src/types/enums.ts``.

SQLAlchemy enum columns must be declared with
``Enum(EnumClass, native_enum=False, length=N)`` so the stored value is the
lowercase string (``member.value``) rather than the member name.
"""

from enum import Enum


class UserRole(str, Enum):
    """Roles a user can hold (column ``users.role``)."""

    EMPLOYEE = "employee"
    SUPPORT = "support"
    MANAGER = "manager"
    ADMIN = "admin"


class TicketStatus(str, Enum):
    """Lifecycle states of a ticket (column ``tickets.status``)."""

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING_FOR_USER = "waiting_for_user"
    RESOLVED = "resolved"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class TicketPriority(str, Enum):
    """Priority levels of a ticket (column ``tickets.priority``)."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TicketCategory(str, Enum):
    """Categories a ticket can be filed under (column ``tickets.category``)."""

    HARDWARE = "hardware"
    SOFTWARE = "software"
    NETWORK = "network"
    EMAIL = "email"
    ACCOUNT_ACCESS = "account_access"
    SECURITY = "security"
    OTHER = "other"


class AuditAction(str, Enum):
    """Actions recorded in the audit trail (column ``audit_logs.action``)."""

    TICKET_CREATED = "ticket_created"
    TICKET_UPDATED = "ticket_updated"
    TICKET_ASSIGNED = "ticket_assigned"
    STATUS_CHANGED = "status_changed"
    PRIORITY_CHANGED = "priority_changed"
    TICKET_DELETED = "ticket_deleted"
    COMMENT_ADDED = "comment_added"
    USER_CREATED = "user_created"
    USER_ROLE_CHANGED = "user_role_changed"
    USER_DEACTIVATED = "user_deactivated"
    USER_ACTIVATED = "user_activated"
    DEPARTMENT_CREATED = "department_created"
    DEPARTMENT_UPDATED = "department_updated"
    DEPARTMENT_DELETED = "department_deleted"
    LOGIN = "login"
