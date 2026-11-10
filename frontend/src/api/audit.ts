/**
 * Audit logs API (CONTRACT §5 — `app/routers/audit.py`, prefix `/api/audit-logs`).
 *
 * Admin-only (enforced server-side). The backend mounts the list endpoint at the
 * trailing-slash path, so the full path is `/audit-logs/`.
 */

import client from '@/api/client';
import type { AuditLog, Paginated } from '@/types/models';
import type { AuditAction } from '@/types/enums';

/** Query parameters accepted by `GET /audit-logs/` (all optional). */
export interface AuditListParams {
  user_id?: number;
  action?: AuditAction;
  /** Entity type filter, e.g. `ticket`, `user`, `department`, `comment`. */
  entity_type?: string;
  /** ISO-8601 lower bound on `created_at`. */
  date_from?: string;
  /** ISO-8601 upper bound on `created_at`. */
  date_to?: string;
  page?: number;
  page_size?: number;
}

/** List audit log entries with optional filters and pagination (admin only). */
export async function list(params: AuditListParams = {}): Promise<Paginated<AuditLog>> {
  const { data } = await client.get<Paginated<AuditLog>>('/audit-logs/', { params });
  return data;
}
