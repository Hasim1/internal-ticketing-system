import type { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional heading rendered in the card header. */
  title?: ReactNode;
  /** Optional sub-heading rendered under the title. */
  subtitle?: ReactNode;
  /** Optional content aligned to the right of the header (e.g. actions). */
  actions?: ReactNode;
  /** Remove the inner padding of the body (useful when embedding tables). */
  noPadding?: boolean;
  /** Card body. */
  children?: ReactNode;
}

/**
 * Generic surface container: rounded-xl, subtle border, soft shadow.
 * Renders an optional header (title/subtitle on the left, actions on the right)
 * followed by the body.
 */
export function Card({
  title,
  subtitle,
  actions,
  noPadding = false,
  className,
  children,
  ...rest
}: CardProps) {
  const hasHeader = Boolean(title || subtitle || actions);

  return (
    <div
      className={clsx(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3>
            )}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx(!noPadding && 'p-5')}>{children}</div>
    </div>
  );
}

export default Card;
