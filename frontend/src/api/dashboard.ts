/**
 * Dashboard & reports API (CONTRACT §5 — `app/routers/dashboard.py`,
 * prefix `/api/dashboard`).
 *
 * All endpoints are role-scoped server-side using the same visibility rules as
 * tickets (admin=all, manager=dept, support=assigned/unassigned, employee=own).
 * `supportPerformance` is restricted to manager/admin.
 */

import client from '@/api/client';
import type {
  ChartPoint,
  DashboardStats,
  SupportPerformance,
} from '@/types/models';

/** Headline counters scoped to the current user (`GET /dashboard/stats`). */
export async function stats(): Promise<DashboardStats> {
  const { data } = await client.get<DashboardStats>('/dashboard/stats');
  return data;
}

/** Visible-ticket counts grouped by status (`GET /dashboard/tickets-by-status`). */
export async function byStatus(): Promise<ChartPoint[]> {
  const { data } = await client.get<ChartPoint[]>('/dashboard/tickets-by-status');
  return data;
}

/** Visible-ticket counts grouped by priority (`GET /dashboard/tickets-by-priority`). */
export async function byPriority(): Promise<ChartPoint[]> {
  const { data } = await client.get<ChartPoint[]>('/dashboard/tickets-by-priority');
  return data;
}

/** Visible-ticket counts grouped by category (`GET /dashboard/tickets-by-category`). */
export async function byCategory(): Promise<ChartPoint[]> {
  const { data } = await client.get<ChartPoint[]>('/dashboard/tickets-by-category');
  return data;
}

/**
 * Per-agent support performance rows (manager/admin only) —
 * `GET /dashboard/support-performance`.
 */
export async function supportPerformance(): Promise<SupportPerformance[]> {
  const { data } = await client.get<SupportPerformance[]>(
    '/dashboard/support-performance',
  );
  return data;
}
