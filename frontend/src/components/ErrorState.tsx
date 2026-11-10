import { AlertTriangle, RotateCw } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/Button';

export interface ErrorStateProps {
  /** Headline shown in the error panel. Defaults to a generic message. */
  title?: string;
  /**
   * Detailed message. Accepts a raw string or an `Error`; the latter's
   * `message` is rendered.
   */
  message?: string | Error | null;
  /** When provided, renders a "Try again" button that invokes this handler. */
  onRetry?: () => void;
  /** Label for the retry button. Defaults to "Try again". */
  retryLabel?: string;
  /** Extra classes for the outer container. */
  className?: string;
}

/** Normalize the various message inputs into a display string. */
function resolveMessage(message: ErrorStateProps['message']): string {
  if (!message) return 'Please try again in a moment.';
  if (message instanceof Error) return message.message;
  return message;
}

/**
 * Error placeholder for data views: a warning icon, a title, the error detail,
 * and an optional retry action.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={clsx(
        'flex w-full flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{resolveMessage(message)}</p>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<RotateCw className="h-4 w-4" />}
          className="mt-2"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
