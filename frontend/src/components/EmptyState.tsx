import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export interface EmptyStateProps {
  /** lucide icon shown in the muted circle. Defaults to an inbox. */
  icon?: LucideIcon;
  /** Headline, e.g. "No tickets yet". */
  title: string;
  /** Supporting description guiding the user toward the next step. */
  message?: string;
  /** Optional call-to-action (e.g. a `<Button>`). */
  action?: ReactNode;
  /** Extra classes for the outer container. */
  className?: string;
}

/**
 * Friendly placeholder shown when a data view has no results: a muted icon,
 * a title, an optional message, and an optional primary action.
 */
export function EmptyState({ icon: Icon = Inbox, title, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex w-full flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {message && <p className="text-sm text-slate-500">{message}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
