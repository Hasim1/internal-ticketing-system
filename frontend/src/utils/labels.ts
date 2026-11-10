/**
 * Thin display helpers that wrap the enum `*_LABELS` maps from `@/types/enums`.
 *
 * Each helper looks the value up in its canonical label map and, if the value
 * is unknown (e.g. a future enum member the frontend has not been updated for),
 * falls back to {@link toTitleCase} so the UI degrades gracefully instead of
 * rendering a raw snake_case string.
 */

import {
  AUDIT_ACTION_LABELS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  toTitleCase,
  type AuditAction,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type UserRole,
} from '@/types/enums';

/**
 * Look a value up in a label map, falling back to a Title Case rendering of the
 * raw value when the key is absent. Generic over the enum's string-literal type.
 */
function labelFor<T extends string>(
  value: T | string | null | undefined,
  map: Record<T, string>,
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const known = (map as Record<string, string>)[value];
  return known ?? toTitleCase(value);
}

/** Human label for a `UserRole` (e.g. `manager` → "Manager"). */
export function roleLabel(role: UserRole | string | null | undefined): string {
  return labelFor(role, ROLE_LABELS);
}

/** Human label for a `TicketStatus` (e.g. `in_progress` → "In Progress"). */
export function statusLabel(status: TicketStatus | string | null | undefined): string {
  return labelFor(status, STATUS_LABELS);
}

/** Human label for a `TicketPriority` (e.g. `critical` → "Critical"). */
export function priorityLabel(priority: TicketPriority | string | null | undefined): string {
  return labelFor(priority, PRIORITY_LABELS);
}

/** Human label for a `TicketCategory` (e.g. `account_access` → "Account Access"). */
export function categoryLabel(category: TicketCategory | string | null | undefined): string {
  return labelFor(category, CATEGORY_LABELS);
}

/** Human label for an `AuditAction` (e.g. `status_changed` → "Status Changed"). */
export function auditActionLabel(action: AuditAction | string | null | undefined): string {
  return labelFor(action, AUDIT_ACTION_LABELS);
}

/**
 * Generic snake_case → Title Case label for any string not covered by a
 * dedicated enum map (e.g. an audit log's free-form `entity_type`).
 * Re-exported here so callers have a single import surface for labels.
 */
export function genericLabel(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return toTitleCase(value);
}
