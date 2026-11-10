"""SQLAlchemy model recording a ticket's status transitions."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import TicketStatus

if TYPE_CHECKING:  # pragma: no cover - import only for static type checking
    from app.models.ticket import Ticket
    from app.models.user import User


class TicketStatusHistory(Base):
    """An immutable audit row for a single ticket status change.

    ``old_status`` is nullable to capture the initial transition (``None`` ->
    ``open``) recorded when a ticket is first created.
    """

    __tablename__ = "ticket_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id"),
        nullable=False,
    )
    changed_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    old_status: Mapped[Optional[TicketStatus]] = mapped_column(
        Enum(TicketStatus, native_enum=False, length=20),
        nullable=True,
    )
    new_status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, native_enum=False, length=20),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    ticket: Mapped["Ticket"] = relationship(
        "Ticket",
        back_populates="status_history",
    )
    changed_by: Mapped["User"] = relationship(
        "User",
        back_populates="status_changes",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<TicketStatusHistory id={self.id} ticket_id={self.ticket_id} "
            f"{self.old_status}->{self.new_status}>"
        )
