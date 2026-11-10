import { clsx } from 'clsx';
import type { TicketStatus } from '@/types/enums';
import { STATUS_BADGE, STATUS_LABELS } from '@/types/enums';

export interface StatusBadgeProps {
  /** The ticket status to render. */
  status: TicketStatus;
  /** Extra classes for the badge. */
  className?: string;
}

const BASE =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';

/**
 * Pill badge for a {@link TicketStatus}, using the canonical label and Tailwind
 * color maps from `@/types/enums` (CONTRACT §9).
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={clsx(BASE, STATUS_BADGE[status], className)}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default StatusBadge;
