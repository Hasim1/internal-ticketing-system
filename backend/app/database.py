"""Database engine, session factory, declarative base and FastAPI dependency.

All ORM models inherit from :class:`Base`. Request-scoped sessions are provided
by :func:`get_db`, which is used as a FastAPI dependency.
"""

from __future__ import annotations

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# ``pool_pre_ping`` validates pooled connections before use, transparently
# replacing any that have been dropped by the database server.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)

# Session factory. Sessions are created per-request and closed afterwards.
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
    future=True,
)


class Base(DeclarativeBase):
    """Declarative base shared by every SQLAlchemy model in the project."""


def get_db() -> Generator[Session, None, None]:
    """Yield a database session and guarantee it is closed afterwards.

    Intended for use as a FastAPI dependency::

        def endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
