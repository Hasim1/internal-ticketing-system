/**
 * `usePagination` — local state + derived helpers for paginated list views.
 *
 * Tracks the current 1-based `page` and `pageSize`, and derives total-page math
 * once the caller feeds in the `total` count from a {@link Paginated} response.
 * It deliberately owns no data fetching — pages drive a query, the response's
 * `total` flows back in via {@link setTotal}.
 *
 * @example
 *   const pg = usePagination({ pageSize: 20 });
 *   const { data } = useQuery(['tickets', pg.page, pg.pageSize], () =>
 *     listTickets({ page: pg.page, page_size: pg.pageSize }));
 *   useEffect(() => { if (data) pg.setTotal(data.total); }, [data]);
 */

import { useCallback, useMemo, useState } from 'react';

/** Options accepted by {@link usePagination}. */
export interface UsePaginationOptions {
  /** 1-based starting page. Defaults to 1. */
  initialPage?: number;
  /** Items per page. Defaults to 20 (matches the backend default). */
  pageSize?: number;
}

/** Everything {@link usePagination} returns. */
export interface UsePaginationResult {
  /** Current 1-based page index. */
  page: number;
  /** Items requested per page. */
  pageSize: number;
  /** Total matching records across all pages (driven by API `total`). */
  total: number;
  /** Total number of pages (`ceil(total / pageSize)`, at least 1). */
  pageCount: number;
  /** Whether a previous page exists. */
  hasPrev: boolean;
  /** Whether a next page exists (requires `total` to be known). */
  hasNext: boolean;
  /** 1-based index of the first item on the current page (0 when empty). */
  rangeStart: number;
  /** 1-based index of the last item on the current page (0 when empty). */
  rangeEnd: number;
  /** Jump to a specific page (clamped to `[1, pageCount]`). */
  setPage: (page: number) => void;
  /** Advance one page if possible. */
  nextPage: () => void;
  /** Go back one page if possible. */
  prevPage: () => void;
  /** Record the API's `total`; recomputes page math and re-clamps `page`. */
  setTotal: (total: number) => void;
  /** Change page size and reset to page 1 (page boundaries shift). */
  setPageSize: (size: number) => void;
  /** Reset to the first page (e.g. when filters/search change). */
  reset: () => void;
}

/** Default items per page; mirrors the backend's `page_size` default. */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Manage 1-based pagination state for a list view.
 */
export function usePagination(options: UsePaginationOptions = {}): UsePaginationResult {
  const { initialPage = 1, pageSize: initialPageSize = DEFAULT_PAGE_SIZE } = options;

  const [page, setPageState] = useState<number>(Math.max(1, initialPage));
  const [pageSize, setPageSizeState] = useState<number>(Math.max(1, initialPageSize));
  const [total, setTotalState] = useState<number>(0);

  // At least one page always exists so the UI never shows "Page 1 of 0".
  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  const setPage = useCallback(
    (next: number) => {
      setPageState((current) => {
        const max = Math.max(1, Math.ceil(total / pageSize));
        // Clamp into range; ignore NaN by falling back to the current page.
        if (Number.isNaN(next)) {
          return current;
        }
        return Math.min(Math.max(1, Math.trunc(next)), max);
      });
    },
    [total, pageSize],
  );

  const nextPage = useCallback(() => setPage(page + 1), [setPage, page]);
  const prevPage = useCallback(() => setPage(page - 1), [setPage, page]);

  const setTotal = useCallback((nextTotal: number) => {
    const safe = Number.isFinite(nextTotal) ? Math.max(0, Math.trunc(nextTotal)) : 0;
    setTotalState(safe);
    // Re-clamp the current page in case the new total has fewer pages.
    setPageState((current) => {
      const max = Math.max(1, Math.ceil(safe / pageSize));
      return Math.min(current, max);
    });
  }, [pageSize]);

  const setPageSize = useCallback((size: number) => {
    const safe = Math.max(1, Math.trunc(size));
    setPageSizeState(safe);
    // Page boundaries change with size; resetting to page 1 is least surprising.
    setPageState(1);
  }, []);

  const reset = useCallback(() => setPageState(1), []);

  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  // Display range, e.g. "Showing 21–40 of 137". Zero when there are no rows.
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  return {
    page,
    pageSize,
    total,
    pageCount,
    hasPrev,
    hasNext,
    rangeStart,
    rangeEnd,
    setPage,
    nextPage,
    prevPage,
    setTotal,
    setPageSize,
    reset,
  };
}

export default usePagination;
