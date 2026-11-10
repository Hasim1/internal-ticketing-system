import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value.
 *
 * Returns a copy of `value` that only updates after `delay` milliseconds have
 * elapsed without `value` changing. Useful for search inputs where we want to
 * avoid firing a request on every keystroke.
 *
 * @param value The value to debounce.
 * @param delay Debounce delay in milliseconds (defaults to 300ms).
 * @returns The debounced value.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useDebounce;
