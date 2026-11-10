"""SQLAlchemy model for organizational departments."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:  # pragma: no cover - import only for static type checking
    from app.models.ticket import Ticket
    from app.models.user import User


class Department(Base):
    """A department that users belong to and tickets can be routed to."""

    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    users: Mapped[List["User"]] = relationship(
        "User",
        back_populates="department",
    )
    tickets: Mapped[List["Ticket"]] = relationship(
        "Ticket",
        back_populates="department",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Department id={self.id} name={self.name!r}>"
