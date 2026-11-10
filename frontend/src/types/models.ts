/**
 * TypeScript interfaces mirroring the backend Pydantic read schemas
 * (CONTRACT §6, `backend/app/schemas/*.py`).
 *
 * Field names, nullability, and nesting match the API responses exactly so that
 * the typed API client in `@/api/*` can return these shapes without casting.
 *
 * Conventions:
 *   - Optional/nullable backend fields (`Optional[...]`) are typed `T | null`.
 *     The API may serialize an absent value as `null`; some may also omit it, so
 *     consumers should treat `null`/`undefined` interchangeably for these.
 *   - All `datetime` fields are ISO-8601 strings as returned by FastAPI.
 */

import type {
  AuditAction,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '@/types/enums';

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

/** Compact user reference embedded inside other read models (`UserBrief`). */
export interface UserBrief {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
}

/** Full user representation returned by user/auth endpoints (`UserRead`). */
export interface User {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  department_id: number | null;
  department: DepartmentBrief | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Departments                                                                */
/* -------------------------------------------------------------------------- */

/** Compact department reference embedded inside other read models (`DepartmentBrief`). */
export interface DepartmentBrief {
  id: number;
  name: string;
}

/** Full department representation returned by department endpoints (`DepartmentRead`). */
export interface Department {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  /** Populated by the service layer; defaults to 0 server-side. */
  user_count: number;
  /** Populated by the service layer; defaults to 0 server-side. */
  ticket_count: number;
}

/* -------------------------------------------------------------------------- */
/* Tickets                                                                    */
/* -------------------------------------------------------------------------- */

/** Full ticket representation returned by ticket endpoints (`TicketRead`). */
export interface Ticket {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  created_by: UserBrief;
  assigned_to: UserBrief | null;
  department: DepartmentBrief | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

/* -------------------------------------------------------------------------- */
/* Comments                                                                   */
/* -------------------------------------------------------------------------- */

/** A comment returned by the comments endpoints (`CommentRead`). */
export interface Comment {
  id: number;
  ticket_id: number;
  user: UserBrief;
  comment: string;
  is_internal: boolean;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Audit logs                                                                 */
/* -------------------------------------------------------------------------- */

/** A single audit log entry returned by the audit endpoint (`AuditLogRead`). */
export interface AuditLog {
  id: number;
  user: UserBrief | null;
  action: AuditAction;
  entity_type: string;
  entity_id: number | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Dashboard & reports                                                        */
/* -------------------------------------------------------------------------- */

/** Aggregate ticket counts scoped to the requesting user's visibility (`DashboardStats`). */
export interface DashboardStats {
  total_tickets: number;
  open: number;
  in_progress: number;
  waiting_for_user: number;
  resolved: number;
  closed: number;
  cancelled: number;
  critical: number;
  unassigned: number;
  /** Mean hours between creation and resolution; `null` when no resolved tickets. */
  avg_resolution_hours: number | null;
  /** Only meaningful for support users; `null` for roles where it does not apply. */
  my_open_assigned: number | null;
}

/** A single labelled data point used by dashboard/report charts (`ChartPoint`). */
export interface ChartPoint {
  label: string;
  value: number;
}

/** Per-agent performance row for the support-performance report (`SupportPerformance`). */
export interface SupportPerformance {
  user_id: number;
  full_name: string;
  assigned: number;
  resolved: number;
  /** Mean resolution time in hours; `null` when the agent has resolved none. */
  avg_resolution_hours: number | null;
}

/* -------------------------------------------------------------------------- */
/* Pagination envelope                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Uniform pagination envelope returned by every list endpoint (CONTRACT §5):
 * `{ items, total, page, page_size, pages }`.
 */
export interface Paginated<T> {
  /** The page of results. */
  items: T[];
  /** Total number of matching records across all pages. */
  total: number;
  /** 1-based index of the current page. */
  page: number;
  /** Maximum number of items per page. */
  page_size: number;
  /** Total number of pages (`ceil(total / page_size)`). */
  pages: number;
}
