"""ORM model package.

Importing this package eagerly imports ``Base`` and every model class so that
``Base.metadata`` is fully populated. This guarantees that
``Base.metadata.create_all()`` and Alembic autogeneration see all tables and
that SQLAlchemy can resolve the string-based relationships between models.
"""

from app.database import Base
from app.models.audit import AuditLog
from app.models.comment import TicketComment
from app.models.department import Department
from app.models.enums import (
    AuditAction,
    TicketCategory,
    TicketPriority,
    TicketStatus,
    UserRole,
)
from app.models.status_history import TicketStatusHistory
from app.models.ticket import Ticket
from app.models.user import User

__all__ = [
    "Base",
    # Models
    "AuditLog",
    "Department",
    "Ticket",
    "TicketComment",
    "TicketStatusHistory",
    "User",
    # Enums
    "AuditAction",
    "TicketCategory",
    "TicketPriority",
    "TicketStatus",
    "UserRole",
]
