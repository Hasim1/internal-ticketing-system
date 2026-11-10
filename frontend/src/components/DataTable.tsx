import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Loading } from '@/components/Loading';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

/** Column definition for {@link DataTable}. */
export interface Column<T> {
  /**
   * Unique key for the column. When no `render` is supplied and the key is a
   * property of `T`, that field's value is shown directly.
   */
  key: string;
  /** Header label (or custom node). */
  header: ReactNode;
  /** Custom cell renderer; receives the row and its index. */
  render?: (row: T, index: number) => ReactNode;
  /** Horizontal alignment of the cell content. Defaults to `left`. */
  align?: 'left' | 'center' | 'right';
  /** Optional extra classes applied to both the header and body cells. */
  className?: string;
  /** Optional fixed/utility width class, e.g. `w-32`. */
  widthClassName?: string;
}

export interface DataTableProps<T> {
  /** Column configuration. */
  columns: Column<T>[];
  /** Row data. */
  rows: T[];
  /** Derive a stable React key for a row. Defaults to the row index. */
  rowKey?: (row: T, index: number) => string | number;
  /** Show the loading placeholder instead of rows. */
  loading?: boolean;
  /** Render an error placeholder (with optional retry) instead of rows. */
  error?: string | Error | null;
  /** Retry handler surfaced by the error placeholder. */
  onRetry?: () => void;
  /** Title for the empty placeholder. Defaults to "No data". */
  emptyTitle?: string;
  /** Message for the empty placeholder. */
  emptyMessage?: string;
  /** Action node for the empty placeholder. */
  emptyAction?: ReactNode;
  /** Invoked when a row is clicked; makes rows interactive when provided. */
  onRowClick?: (row: T, index: number) => void;
  /** Extra classes for the scroll container. */
  className?: string;
}

const ALIGN_CLASSES: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/**
 * Generic, presentational table driven by a `columns` config.
 *
 * Handles loading, error, and empty states internally so callers can pass the
 * raw async result. When `render` is omitted, the column renders `row[key]`
 * (coerced to a string) for the matching field.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No data',
  emptyMessage,
  emptyAction,
  onRowClick,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
      </div>
    );
  }

  const renderCell = (column: Column<T>, row: T, index: number): ReactNode => {
    if (column.render) return column.render(row, index);
    const value = (row as Record<string, unknown>)[column.key];
    if (value === null || value === undefined) return '—';
    return String(value);
  };

  return (
    <div
      className={clsx(
        'overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={clsx(
                  'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500',
                  ALIGN_CLASSES[column.align ?? 'left'],
                  column.widthClassName,
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr
              key={rowKey ? rowKey(row, index) : index}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              className={clsx(
                'transition-colors',
                onRowClick && 'cursor-pointer hover:bg-slate-50',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={clsx(
                    'px-4 py-3 text-sm text-slate-700 align-middle',
                    ALIGN_CLASSES[column.align ?? 'left'],
                    column.className,
                  )}
                >
                  {renderCell(column, row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
