/**
 * Date / time / duration formatting helpers used across the app.
 *
 * All backend `datetime` fields arrive as ISO-8601 strings (see
 * `@/types/models`). These helpers accept either an ISO string, a `Date`, or
 * `null`/`undefined` (rendering a dash placeholder) so callers never have to
 * guard before formatting.
 */

/** Rendered when a date/value is missing — keeps tables visually aligned. */
const EMPTY = '—';

/** A value that may carry a timestamp: ISO string, `Date`, or absent. */
export type DateInput = string | number | Date | null | undefined;

/**
 * Coerce a {@link DateInput} into a valid `Date`, or `null` when the value is
 * absent or unparseable. Centralises the null/NaN guarding for every helper.
 */
function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format a date as a short, locale-aware calendar date, e.g. `Jun 17, 2026`.
 * Returns the em-dash placeholder for missing/invalid input.
 */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) {
    return EMPTY;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date and time together, e.g. `Jun 17, 2026, 2:30 PM`.
 * Returns the em-dash placeholder for missing/invalid input.
 */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) {
    return EMPTY;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Time thresholds (in seconds) for {@link relativeTime}. */
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Express how long ago (or until) a timestamp is, relative to now, e.g.
 * `just now`, `5 minutes ago`, `in 2 days`. Falls back to {@link formatDate}
 * for spans of a year or more, where a relative phrase is less useful than the
 * absolute date.
 */
export function relativeTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) {
    return EMPTY;
  }

  const deltaSeconds = (date.getTime() - Date.now()) / 1000;
  const past = deltaSeconds <= 0;
  const abs = Math.abs(deltaSeconds);

  if (abs < 45) {
    return 'just now';
  }
  if (abs >= YEAR) {
    // Beyond a year, an absolute date communicates more than "in 2 years".
    return formatDate(date);
  }

  let unit: string;
  let count: number;
  if (abs < HOUR) {
    count = Math.round(abs / MINUTE);
    unit = 'minute';
  } else if (abs < DAY) {
    count = Math.round(abs / HOUR);
    unit = 'hour';
  } else if (abs < WEEK) {
    count = Math.round(abs / DAY);
    unit = 'day';
  } else if (abs < MONTH) {
    count = Math.round(abs / WEEK);
    unit = 'week';
  } else {
    count = Math.round(abs / MONTH);
    unit = 'month';
  }

  const plural = count === 1 ? unit : `${unit}s`;
  return past ? `${count} ${plural} ago` : `in ${count} ${plural}`;
}

/**
 * Render a duration given in (possibly fractional) hours as a human phrase,
 * e.g. `45m`, `3.5h`, `2d 4h`. Used for `avg_resolution_hours` and similar
 * metrics. Returns the em-dash placeholder for `null`/`undefined`.
 *
 * @param hours - Duration in hours, or `null`/`undefined` when not available.
 */
export function hoursToHuman(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) {
    return EMPTY;
  }
  if (hours < 0) {
    return EMPTY;
  }

  // Sub-hour durations read better in whole minutes.
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return minutes <= 0 ? '0m' : `${minutes}m`;
  }

  // Under a day: a single decimal hour value is precise enough and compact.
  // `Math.round(x * 10) / 10` already drops a trailing `.0` for whole hours
  // (e.g. `3` not `3.0`), so we can interpolate the number directly.
  if (hours < 24) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded}h`;
  }

  // A day or more: split into whole days + remaining whole hours.
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours - days * 24);
  if (remHours === 0) {
    return `${days}d`;
  }
  // Carry handles the edge case where rounding pushes hours to 24.
  if (remHours === 24) {
    return `${days + 1}d`;
  }
  return `${days}d ${remHours}h`;
}
