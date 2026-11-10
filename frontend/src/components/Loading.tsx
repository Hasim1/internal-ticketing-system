import { clsx } from 'clsx';
import { Spinner } from '@/components/Spinner';

export interface LoadingProps {
  /** Optional message shown beneath the spinner. */
  message?: string;
  /** Minimum height of the loading area. Defaults to a generous panel height. */
  className?: string;
  /** When true, fills the entire viewport (useful for app-level boot). */
  fullScreen?: boolean;
}

/**
 * Full-area loading state: a centered spinner with an optional message.
 * Use inside data panels/pages while an initial fetch is in flight.
 */
export function Loading({ message = 'Loading…', className, fullScreen = false }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'flex w-full flex-col items-center justify-center gap-3 text-slate-500',
        fullScreen ? 'min-h-screen' : 'min-h-[240px]',
        className,
      )}
    >
      <Spinner size="lg" />
      {message && <p className="text-sm font-medium">{message}</p>}
    </div>
  );
}

export default Loading;
