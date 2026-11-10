"""SQLAlchemy model for comments posted on tickets."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:  # pragma: no cover - import only for static type checking
    from app.models.ticket import Ticket
    from app.models.user import User


class TicketComment(Base):
    """A comment left on a ticket.

    ``is_internal`` comments are visible only to support/manager/admin roles;
    employees never see them (enforced in the comments service/router).
    """

    __tablename__ = "ticket_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    ticket: Mapped["Ticket"] = relationship(
        "Ticket",
        back_populates="comments",
    )
    user: Mapped["User"] = relationship(
        "User",
        back_populates="comments",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return (
            f"<TicketComment id={self.id} ticket_id={self.ticket_id} "
            f"internal={self.is_internal}>"
        )
