import { clsx } from 'clsx';
import { ChevronsUp, ChevronUp, Equal, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TicketPriority } from '@/types/enums';
import { PRIORITY_BADGE, PRIORITY_LABELS } from '@/types/enums';

export interface PriorityBadgeProps {
  /** The ticket priority to render. */
  priority: TicketPriority;
  /** Show a small leading icon indicating severity. Defaults to false. */
  withIcon?: boolean;
  /** Extra classes for the badge. */
  className?: string;
}

const BASE =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';

const PRIORITY_ICON: Record<TicketPriority, LucideIcon> = {
  low: Minus,
  medium: Equal,
  high: ChevronUp,
  critical: ChevronsUp,
};

/**
 * Pill badge for a {@link TicketPriority}, using the canonical label and Tailwind
 * color maps from `@/types/enums` (CONTRACT §9). Optionally shows a severity icon.
 */
export function PriorityBadge({ priority, withIcon = false, className }: PriorityBadgeProps) {
  const Icon = PRIORITY_ICON[priority];

  return (
    <span className={clsx(BASE, PRIORITY_BADGE[priority], className)}>
      {withIcon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export default PriorityBadge;
