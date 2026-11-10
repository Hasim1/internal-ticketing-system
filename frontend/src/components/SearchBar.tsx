import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useDebounce } from '@/hooks/useDebounce';

export interface SearchBarProps {
  /**
   * Controlled value of the search term. The component keeps a local mirror so
   * typing is instant; `onChange` fires only after the debounce interval.
   */
  value?: string;
  /** Called with the debounced search term whenever it settles. */
  onChange: (value: string) => void;
  /** Placeholder text. Defaults to "Search…". */
  placeholder?: string;
  /** Debounce delay in milliseconds. Defaults to 300ms. */
  debounceMs?: number;
  /** Extra classes for the outer container. */
  className?: string;
  /** Disable the input. */
  disabled?: boolean;
}

/**
 * Debounced search input with a leading magnifier and a clear (×) button.
 *
 * Local state makes typing feel instant; the parent's `onChange` is only
 * invoked once the value has been stable for `debounceMs`. The clear button
 * resets immediately. Stays in sync if the controlled `value` changes upstream.
 */
export function SearchBar({
  value = '',
  onChange,
  placeholder = 'Search…',
  debounceMs = 300,
  className,
  disabled = false,
}: SearchBarProps) {
  const [term, setTerm] = useState<string>(value);
  const debounced = useDebounce(term, debounceMs);

  // Propagate the debounced value upward (only when it actually differs).
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // We intentionally exclude `onChange`/`value` from deps: this effect should
    // fire on debounced-value changes only, mirroring the controlled term.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Keep local state aligned if the controlled value is reset externally.
  useEffect(() => {
    setTerm(value);
  }, [value]);

  return (
    <div className={clsx('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
        <Search className="h-4 w-4" aria-hidden="true" />
      </span>
      <input
        type="search"
        value={term}
        disabled={disabled}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={clsx(
          'w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-sm',
          'placeholder:text-slate-400 transition-colors',
          'focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200',
          'disabled:cursor-not-allowed disabled:bg-slate-50',
          // Hide the browser's native search clear control; we render our own.
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {term && !disabled && (
        <button
          type="button"
          onClick={() => setTerm('')}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition-colors hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default SearchBar;
