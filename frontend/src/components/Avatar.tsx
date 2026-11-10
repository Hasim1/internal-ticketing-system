import { useMemo } from 'react';
import { clsx } from 'clsx';

/** Size presets for {@link Avatar}. */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

/**
 * Deterministic palette of background/text pairs. A name maps to a stable color
 * so the same user always renders the same avatar tint.
 */
const PALETTE: string[] = [
  'bg-indigo-100 text-indigo-700',
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-sky-100 text-sky-700',
];

export interface AvatarProps {
  /** Full name used to derive initials and the color tint. */
  name: string;
  /** Size preset. Defaults to `md`. */
  size?: AvatarSize;
  /** Extra classes for the avatar element. */
  className?: string;
  /** Optional override for the title/aria text. Defaults to `name`. */
  title?: string;
}

/** Derive up to two uppercase initials from a full name. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Hash a string into a stable, non-negative index into {@link PALETTE}. */
function paletteIndex(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PALETTE.length;
}

/**
 * Circular initials avatar with a deterministic color derived from the name.
 * Purely presentational — no image loading.
 */
export function Avatar({ name, size = 'md', className, title }: AvatarProps) {
  const initials = useMemo(() => getInitials(name), [name]);
  const tone = useMemo(() => PALETTE[paletteIndex(name || '?')], [name]);

  return (
    <span
      title={title ?? name}
      aria-label={title ?? name}
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
        SIZE_CLASSES[size],
        tone,
        className,
      )}
    >
      {initials}
    </span>
  );
}

export default Avatar;
