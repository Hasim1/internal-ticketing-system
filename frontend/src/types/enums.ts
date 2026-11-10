/**
 * Enum mirror for the Internal Ticketing & Support Management System frontend.
 *
 * Every string-literal value here MUST match the backend enums in
 * `backend/app/models/enums.py` (CONTRACT §2) exactly — these strings are stored
 * in the database, sent over the API, and rendered in the UI.
 *
 * For each enum we expose:
 *   - a string-literal union `type`,
 *   - a `const` array of all values (handy for <select> options and iteration),
 *   - a `LABELS` map (snake_case value -> Title Case label) for display,
 *   - and, where relevant, a Tailwind `BADGE` class map (CONTRACT §9).
 */

/* -------------------------------------------------------------------------- */
/* UserRole                                                                   */
/* -------------------------------------------------------------------------- */

/** Roles a user can hold (column `users.role`). */
export type UserRole = 'employee' | 'support' | 'manager' | 'admin';

/** All `UserRole` values in canonical order. */
export const USER_ROLES: readonly UserRole[] = [
  'employee',
  'support',
  'manager',
  'admin',
] as const;

/** Human-readable labels for `UserRole` values. */
export const ROLE_LABELS: Record<UserRole, string> = {
  employee: 'Employee',
  support: 'Support',
  manager: 'Manager',
  admin: 'Admin',
};

/**
 * Tailwind badge classes for `UserRole` values.
 * Each entry is a self-contained set of background/text/ring utilities so the
 * badge renders consistently regardless of surrounding context.
 */
export const ROLE_BADGE: Record<UserRole, string> = {
  employee: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  support: 'bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200',
  manager: 'bg-violet-100 text-violet-700 ring-1 ring-inset ring-violet-200',
  admin: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200',
};

/* -------------------------------------------------------------------------- */
/* TicketStatus                                                               */
/* -------------------------------------------------------------------------- */

/** Lifecycle states of a ticket (column `tickets.status`). */
export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_for_user'
  | 'resolved'
  | 'closed'
  | 'cancelled';

/** All `TicketStatus` values in lifecycle order. */
export const TICKET_STATUSES: readonly TicketStatus[] = [
  'open',
  'in_progress',
  'waiting_for_user',
  'resolved',
  'closed',
  'cancelled',
] as const;

/** Human-readable labels for `TicketStatus` values. */
export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting_for_user: 'Waiting For User',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/**
 * Tailwind badge classes for `TicketStatus` values (CONTRACT §9):
 * open=blue, in_progress=amber, waiting_for_user=purple, resolved=green,
 * closed=slate/gray, cancelled=rose.
 */
export const STATUS_BADGE: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200',
  waiting_for_user: 'bg-purple-100 text-purple-700 ring-1 ring-inset ring-purple-200',
  resolved: 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-200',
  closed: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
  cancelled: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200',
};

/* -------------------------------------------------------------------------- */
/* TicketPriority                                                             */
/* -------------------------------------------------------------------------- */

/** Priority levels of a ticket (column `tickets.priority`). */
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

/** All `TicketPriority` values from lowest to highest. */
export const TICKET_PRIORITIES: readonly TicketPriority[] = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

/** Human-readable labels for `TicketPriority` values. */
export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

/**
 * Tailwind badge classes for `TicketPriority` values (CONTRACT §9):
 * low=slate, medium=blue, high=orange, critical=red.
 */
export const PRIORITY_BADGE: Record<TicketPriority, string> = {
  low: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
  medium: 'bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200',
  high: 'bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-200',
  critical: 'bg-red-100 text-red-700 ring-1 ring-inset ring-red-200',
};

/* -------------------------------------------------------------------------- */
/* TicketCategory                                                             */
/* -------------------------------------------------------------------------- */

/** Categories a ticket can be filed under (column `tickets.category`). */
export type TicketCategory =
  | 'hardware'
  | 'software'
  | 'network'
  | 'email'
  | 'account_access'
  | 'security'
  | 'other';

/** All `TicketCategory` values in canonical order. */
export const TICKET_CATEGORIES: readonly TicketCategory[] = [
  'hardware',
  'software',
  'network',
  'email',
  'account_access',
  'security',
  'other',
] as const;

/** Human-readable labels for `TicketCategory` values. */
export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  hardware: 'Hardware',
  software: 'Software',
  network: 'Network',
  email: 'Email',
  account_access: 'Account Access',
  security: 'Security',
  other: 'Other',
};

/** Tailwind badge classes for `TicketCategory` values (neutral indigo/slate accents). */
export const CATEGORY_BADGE: Record<TicketCategory, string> = {
  hardware: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  software: 'bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200',
  network: 'bg-cyan-100 text-cyan-700 ring-1 ring-inset ring-cyan-200',
  email: 'bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200',
  account_access: 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200',
  security: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200',
  other: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
};

/* -------------------------------------------------------------------------- */
/* AuditAction                                                                */
/* -------------------------------------------------------------------------- */

/** Actions recorded in the audit trail (column `audit_logs.action`). */
export type AuditAction =
  | 'ticket_created'
  | 'ticket_updated'
  | 'ticket_assigned'
  | 'status_changed'
  | 'priority_changed'
  | 'ticket_deleted'
  | 'comment_added'
  | 'user_created'
  | 'user_role_changed'
  | 'user_deactivated'
  | 'user_activated'
  | 'department_created'
  | 'department_updated'
  | 'department_deleted'
  | 'login';

/** All `AuditAction` values in canonical order. */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'ticket_created',
  'ticket_updated',
  'ticket_assigned',
  'status_changed',
  'priority_changed',
  'ticket_deleted',
  'comment_added',
  'user_created',
  'user_role_changed',
  'user_deactivated',
  'user_activated',
  'department_created',
  'department_updated',
  'department_deleted',
  'login',
] as const;

/** Human-readable labels for `AuditAction` values. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  ticket_created: 'Ticket Created',
  ticket_updated: 'Ticket Updated',
  ticket_assigned: 'Ticket Assigned',
  status_changed: 'Status Changed',
  priority_changed: 'Priority Changed',
  ticket_deleted: 'Ticket Deleted',
  comment_added: 'Comment Added',
  user_created: 'User Created',
  user_role_changed: 'User Role Changed',
  user_deactivated: 'User Deactivated',
  user_activated: 'User Activated',
  department_created: 'Department Created',
  department_updated: 'Department Updated',
  department_deleted: 'Department Deleted',
  login: 'Login',
};

/**
 * Tailwind badge classes for `AuditAction` values, grouped by semantic intent
 * (create=green, update/change=blue/amber, delete=rose, auth=indigo).
 */
export const AUDIT_ACTION_BADGE: Record<AuditAction, string> = {
  ticket_created: 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-200',
  ticket_updated: 'bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200',
  ticket_assigned: 'bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200',
  status_changed: 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200',
  priority_changed: 'bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-200',
  ticket_deleted: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200',
  comment_added: 'bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200',
  user_created: 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-200',
  user_role_changed: 'bg-violet-100 text-violet-700 ring-1 ring-inset ring-violet-200',
  user_deactivated: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200',
  user_activated: 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-200',
  department_created: 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-200',
  department_updated: 'bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200',
  department_deleted: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200',
  login: 'bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200',
};

/* -------------------------------------------------------------------------- */
/* Generic label fallback helper                                              */
/* -------------------------------------------------------------------------- */

/**
 * Convert any snake_case enum string into a Title Case label.
 * Use the dedicated `*_LABELS` maps above when the key type is known; this is a
 * safe fallback for arbitrary/unknown values (e.g. future enum members).
 */
export function toTitleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
