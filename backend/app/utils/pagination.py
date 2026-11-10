"""Pagination helpers shared by paginated list endpoints.

The API exposes a consistent envelope for paginated responses::

    {"items": [...], "total": N, "page": P, "page_size": S, "pages": K}

:func:`paginate` runs a SQLAlchemy query with LIMIT/OFFSET and returns the
slice of items alongside the total count and page count. :func:`build_page`
assembles the response dict from already-fetched items.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Sequence, Tuple

from sqlalchemy.orm import Query

# Sensible bounds so callers can't request degenerate or abusive page sizes.
DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def _normalize(page: int, page_size: int) -> Tuple[int, int]:
    """Clamp ``page`` and ``page_size`` into safe ranges."""
    if page is None or page < 1:
        page = DEFAULT_PAGE
    if page_size is None or page_size < 1:
        page_size = DEFAULT_PAGE_SIZE
    if page_size > MAX_PAGE_SIZE:
        page_size = MAX_PAGE_SIZE
    return page, page_size


def _page_count(total: int, page_size: int) -> int:
    """Compute the number of pages for ``total`` rows at ``page_size``."""
    if total <= 0 or page_size <= 0:
        return 0
    return math.ceil(total / page_size)


def paginate(
    query: Query,
    page: int = DEFAULT_PAGE,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> Tuple[List[Any], int, int]:
    """Apply LIMIT/OFFSET pagination to a SQLAlchemy ``Query``.

    Args:
        query: A SQLAlchemy ORM query (already filtered/ordered).
        page: 1-based page number. Values < 1 are clamped to 1.
        page_size: Items per page. Clamped to ``[1, MAX_PAGE_SIZE]``.

    Returns:
        A tuple ``(items, total, pages)`` where ``items`` is the requested
        slice, ``total`` is the unpaginated row count, and ``pages`` is the
        total number of pages.
    """
    page, page_size = _normalize(page, page_size)

    # ``Query.order_by(None)`` is intentionally not applied: the count is taken
    # against the filtered query as provided by the caller.
    total = query.count()
    pages = _page_count(total, page_size)

    offset = (page - 1) * page_size
    items = query.limit(page_size).offset(offset).all()

    return items, total, pages


def build_page(
    items: Sequence[Any],
    total: int,
    page: int = DEFAULT_PAGE,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> Dict[str, Any]:
    """Assemble the standard paginated-response envelope.

    Args:
        items: The page of items to return.
        total: Total number of items across all pages.
        page: The current 1-based page number.
        page_size: The page size used to compute ``pages``.

    Returns:
        A dict with keys ``items``, ``total``, ``page``, ``page_size`` and
        ``pages``, matching the API contract's pagination envelope.
    """
    page, page_size = _normalize(page, page_size)
    return {
        "items": list(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": _page_count(total, page_size),
    }
