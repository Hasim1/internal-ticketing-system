import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { clsx } from 'clsx';

/** Direction of a {@link StatCard} trend, controlling its color and icon. */
export type TrendDirection = 'up' | 'down' | 'neutral';

export interface StatCardTrend {
  /** Pre-formatted trend text, e.g. "+12%" or "3 today". */
  value: string;
  /** Direction influences the icon and color (defaults to `neutral`). */
  direction?: TrendDirection;
  /** Optional context shown after the trend value, e.g. "vs last week". */
  label?: string;
}

/** Accent color presets for the icon chip. */
export type StatCardTone = 'indigo' | 'blue' | 'amber' | 'green' | 'rose' | 'slate' | 'violet';

const TONE_CLASSES: Record<StatCardTone, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-green-50 text-green-600',
  rose: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate-100 text-slate-600',
  violet: 'bg-violet-50 text-violet-600',
};

const TREND_CLASSES: Record<TrendDirection, string> = {
  up: 'text-green-600',
  down: 'text-rose-600',
  neutral: 'text-slate-500',
};

const TREND_ICON: Record<TrendDirection, LucideIcon> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  neutral: Minus,
};

export interface StatCardProps {
  /** Metric label, e.g. "Open Tickets". */
  label: string;
  /** The headline value; numbers and strings both accepted. */
  value: string | number;
  /** lucide icon component rendered in the accent chip. */
  icon?: LucideIcon;
  /** Accent color of the icon chip. Defaults to `indigo`. */
  tone?: StatCardTone;
  /** Optional trend indicator shown beneath the value. */
  trend?: StatCardTrend;
  /** Extra classes for the outer card. */
  className?: string;
}

/**
 * Compact dashboard metric tile: an accent icon chip alongside a label, a large
 * value, and an optional directional trend line.
 */
export function StatCard({ label, value, icon: Icon, tone = 'indigo', trend, className }: StatCardProps) {
  const direction = trend?.direction ?? 'neutral';
  const TrendIcon = TREND_ICON[direction];

  return (
    <div
      className={clsx(
        'flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        {trend && (
          <div className={clsx('mt-2 flex items-center gap-1 text-xs font-medium', TREND_CLASSES[direction])}>
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{trend.value}</span>
            {trend.label && <span className="text-slate-400">{trend.label}</span>}
          </div>
        )}
      </div>

      {Icon && (
        <div className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', TONE_CLASSES[tone])}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export default StatCard;
