import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  /** Total number of pages. */
  pages: number;
  /** Total number of records (across all pages); used for the summary line. */
  total: number;
  /** Items shown per page; used to compute the displayed range. */
  pageSize?: number;
  /** Called with the requested 1-based page when the user navigates. */
  onChange: (page: number) => void;
  /** Extra classes for the outer container. */
  className?: string;
}

/**
 * Build a compact list of page tokens with ellipses, always including the first
 * and last page plus a window around the current page.
 *
 * Example (current=5, pages=10): [1, '…', 4, 5, 6, '…', 10]
 */
function buildPageItems(current: number, pages: number): Array<number | 'ellipsis'> {
  const items: Array<number | 'ellipsis'> = [];
  const window = 1; // pages on each side of the current page

  const start = Math.max(2, current - window);
  const end = Math.min(pages - 1, current + window);

  items.push(1);
  if (start > 2) items.push('ellipsis');
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < pages - 1) items.push('ellipsis');
  if (pages > 1) items.push(pages);

  return items;
}

/**
 * Page navigation control. Shows a "Showing X–Y of N" summary alongside
 * previous/next buttons and numbered page tokens (with ellipses for large
 * ranges). No-ops when there is a single page or fewer.
 */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onChange,
  className,
}: PaginationProps) {
  const safePages = Math.max(pages, 1);
  const safePage = Math.min(Math.max(page, 1), safePages);

  const canPrev = safePage > 1;
  const canNext = safePage < safePages;

  const rangeStart = total === 0 || !pageSize ? (total === 0 ? 0 : 1) : (safePage - 1) * pageSize + 1;
  const rangeEnd = pageSize ? Math.min(safePage * pageSize, total) : total;

  const goTo = (target: number) => {
    const clamped = Math.min(Math.max(target, 1), safePages);
    if (clamped !== safePage) onChange(clamped);
  };

  const items = buildPageItems(safePage, safePages);

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-between gap-3 sm:flex-row',
        className,
      )}
    >
      <p className="text-sm text-slate-500">
        {total === 0 ? (
          'No results'
        ) : (
          <>
            Showing <span className="font-medium text-slate-700">{rangeStart}</span>–
            <span className="font-medium text-slate-700">{rangeEnd}</span> of{' '}
            <span className="font-medium text-slate-700">{total}</span>
          </>
        )}
      </p>

      {safePages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => goTo(safePage - 1)}
            disabled={!canPrev}
            aria-label="Previous page"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {items.map((item, index) =>
            item === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="inline-flex h-9 w-9 items-center justify-center text-sm text-slate-400"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => goTo(item)}
                aria-current={item === safePage ? 'page' : undefined}
                className={clsx(
                  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-medium transition-colors',
                  item === safePage
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => goTo(safePage + 1)}
            disabled={!canNext}
            aria-label="Next page"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}

export default Pagination;
