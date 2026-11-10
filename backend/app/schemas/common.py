"""Shared schema primitives: chart points and paginated list envelopes.

List endpoints in this API return a uniform pagination envelope (CONTRACT §5):

```json
{ "items": [...], "total": 0, "page": 1, "page_size": 20, "pages": 0 }
```

A generic :class:`PaginatedResponse` is provided for reuse, along with explicit
concrete aliases (``PaginatedUsers``, ``PaginatedTickets``, ``PaginatedAuditLogs``)
so FastAPI ``response_model`` annotations and the OpenAPI schema stay readable.
"""

from __future__ import annotations

from typing import Generic, List, TypeVar

from pydantic import BaseModel, ConfigDict

# Forward references to the concrete read schemas; imported lazily at module end
# to avoid circular imports while still resolving the generic aliases.
from app.schemas.audit import AuditLogRead
from app.schemas.user import UserRead
from app.schemas.ticket import TicketRead

ItemT = TypeVar("ItemT")


class ChartPoint(BaseModel):
    """A single labelled data point used by dashboard/report charts."""

    label: str
    value: int


class PaginatedResponse(BaseModel, Generic[ItemT]):
    """Generic pagination envelope shared by every list endpoint.

    Attributes:
        items: The page of results.
        total: Total number of matching records across all pages.
        page: 1-based index of the current page.
        page_size: Maximum number of items per page.
        pages: Total number of pages (``ceil(total / page_size)``).
    """

    items: List[ItemT]
    total: int
    page: int
    page_size: int
    pages: int


# Concrete, explicitly-named aliases for the most common list endpoints. These
# keep ``response_model=PaginatedUsers`` readable and produce clearly-named
# components in the generated OpenAPI document.
class PaginatedUsers(PaginatedResponse[UserRead]):
    """Paginated envelope of :class:`UserRead` records."""


class PaginatedTickets(PaginatedResponse[TicketRead]):
    """Paginated envelope of :class:`TicketRead` records."""


class PaginatedAuditLogs(PaginatedResponse[AuditLogRead]):
    """Paginated envelope of :class:`AuditLogRead` records."""


__all__ = [
    "ChartPoint",
    "PaginatedResponse",
    "PaginatedUsers",
    "PaginatedTickets",
    "PaginatedAuditLogs",
]
