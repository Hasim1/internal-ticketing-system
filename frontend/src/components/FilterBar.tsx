import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Filter, X } from 'lucide-react';

export interface FilterBarProps {
  /**
   * Filter controls (e.g. `<SearchBar>`, `<Select>`) laid out in a responsive
   * row that wraps on small screens.
   */
  children: ReactNode;
  /**
   * When provided, renders a "Clear filters" button. Typically resets all
   * filter state to its defaults.
   */
  onReset?: () => void;
  /**
   * Whether any filter is currently active; controls whether the reset button
   * is enabled. Defaults to true so the button is usable when unspecified.
   */
  hasActiveFilters?: boolean;
  /** Optional leading label/heading for the bar. */
  label?: ReactNode;
  /** Extra classes for the outer container. */
  className?: string;
}

/**
 * Layout wrapper for a row of filter controls. Provides consistent spacing, an
 * optional leading label/icon, and an optional reset button. Purely
 * presentational — it owns no filter state itself.
 */
export function FilterBar({
  children,
  onReset,
  hasActiveFilters = true,
  label,
  className,
}: FilterBarProps) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end',
        className,
      )}
    >
      {label ? (
        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <Filter className="h-4 w-4 text-slate-400" aria-hidden="true" />
          {label}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col flex-wrap gap-3 sm:flex-row sm:items-end">
        {children}
      </div>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={!hasActiveFilters}
          className="inline-flex h-10 items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:self-end"
        >
          <X className="h-4 w-4" />
          Clear filters
        </button>
      )}
    </div>
  );
}

export default FilterBar;
