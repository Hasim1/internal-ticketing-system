import { clsx } from 'clsx';
import type { UserRole } from '@/types/enums';
import { ROLE_BADGE, ROLE_LABELS } from '@/types/enums';

export interface RoleBadgeProps {
  /** The user role to render. */
  role: UserRole;
  /** Extra classes for the badge. */
  className?: string;
}

const BASE =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';

/**
 * Pill badge for a {@link UserRole}, using the canonical label and Tailwind color
 * maps from `@/types/enums` (CONTRACT §9).
 */
export function RoleBadge({ role, className }: RoleBadgeProps) {
  return (
    <span className={clsx(BASE, ROLE_BADGE[role], className)}>{ROLE_LABELS[role]}</span>
  );
}

export default RoleBadge;
