import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { Spinner } from '@/components/Spinner';

/** Visual style variants for {@link Button}. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/** Size presets for {@link Button}. */
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 font-medium rounded-xl border ' +
  'transition-colors duration-150 focus:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-white ' +
  'disabled:opacity-60 disabled:cursor-not-allowed select-none whitespace-nowrap';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 text-white border-transparent hover:bg-indigo-700 ' +
    'active:bg-indigo-800 focus-visible:ring-indigo-500 shadow-sm',
  secondary:
    'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 ' +
    'active:bg-slate-100 focus-visible:ring-indigo-500 shadow-sm',
  danger:
    'bg-rose-600 text-white border-transparent hover:bg-rose-700 ' +
    'active:bg-rose-800 focus-visible:ring-rose-500 shadow-sm',
  ghost:
    'bg-transparent text-slate-600 border-transparent hover:bg-slate-100 ' +
    'active:bg-slate-200 focus-visible:ring-indigo-500',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 h-8',
  md: 'text-sm px-4 py-2 h-10',
  lg: 'text-base px-5 py-2.5 h-12',
};

const SPINNER_SIZE: Record<ButtonSize, 'xs' | 'sm' | 'md'> = {
  sm: 'xs',
  md: 'sm',
  lg: 'sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Size preset. Defaults to `md`. */
  size?: ButtonSize;
  /** When true, shows a spinner and disables the button. */
  loading?: boolean;
  /** Icon rendered before the label. */
  leftIcon?: ReactNode;
  /** Icon rendered after the label. */
  rightIcon?: ReactNode;
  /** Stretch the button to fill its container width. */
  fullWidth?: boolean;
}

/**
 * Primary action button with variant/size styling, a loading state, and optional
 * leading/trailing icons. Forwards refs and spreads native button attributes.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={clsx(
        BASE_CLASSES,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={SPINNER_SIZE[size]} className="text-current" label="" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
