import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

/** Size presets for the {@link Spinner}. */
export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

export interface SpinnerProps {
  /** Visual size of the spinner. Defaults to `md`. */
  size?: SpinnerSize;
  /** Additional classes (e.g. to override the color via `text-*`). */
  className?: string;
  /** Accessible label announced to assistive tech. Defaults to "Loading". */
  label?: string;
}

/**
 * A lightweight, spinning loading indicator built on the lucide `Loader2` icon.
 * Inherits its color from the surrounding `text-*` utility unless overridden.
 */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <Loader2
      role="status"
      aria-label={label}
      className={clsx('animate-spin text-indigo-600', SIZE_CLASSES[size], className)}
    />
  );
}

export default Spinner;
