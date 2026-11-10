"""Audit-trail service.

The single responsibility of this module is to append :class:`AuditLog` rows to
the current session. It deliberately does **not** commit — the caller (another
service performing the mutation being audited) owns the transaction boundary so
that the audited change and its audit row are committed atomically together.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.enums import AuditAction


def _stringify(value: Any) -> Optional[str]:
    """Coerce an arbitrary value into the ``Text`` representation we persist.

    ``None`` is preserved as ``None`` (NULL column). Enum members are reduced to
    their ``.value`` string; everything else is rendered with ``str()``.
    """

    if value is None:
        return None
    # ``(str, Enum)`` members are already ``str`` instances, but ``str(member)``
    # yields e.g. ``"TicketStatus.OPEN"``. Prefer the contract's lowercase value.
    enum_value = getattr(value, "value", None)
    if enum_value is not None and not isinstance(value, (str, int, float, bool)):
        return str(enum_value)
    return str(value)


def log_action(
    db: Session,
    user_id: Optional[int],
    action: AuditAction,
    entity_type: str,
    entity_id: Optional[int] = None,
    old_value: Any = None,
    new_value: Any = None,
) -> AuditLog:
    """Create and stage an :class:`AuditLog` row (no commit).

    Args:
        db: Active SQLAlchemy session. The row is added (and flushed) but **not**
            committed — the calling service commits as part of its own unit of
            work.
        user_id: The acting user's id, or ``None`` for system/anonymous actions.
        action: The :class:`AuditAction` describing what happened.
        entity_type: Free-form entity label, e.g. ``"ticket"``, ``"user"``,
            ``"department"``, ``"comment"``.
        entity_id: The affected entity's primary key, if applicable.
        old_value: Previous value (stringified for storage). Optional.
        new_value: New value (stringified for storage). Optional.

    Returns:
        The freshly added (and flushed) :class:`AuditLog` instance.
    """

    log = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=_stringify(old_value),
        new_value=_stringify(new_value),
    )
    db.add(log)
    # Flush so the row participates in the caller's transaction and obtains its
    # primary key, without ending the transaction.
    db.flush()
    return log
