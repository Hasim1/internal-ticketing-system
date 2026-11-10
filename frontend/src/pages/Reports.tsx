/**
 * Reports — manager/admin analytics page (CONTRACT §9, route `/reports`).
 *
 * Surfaces support-team performance and ticket-distribution insight, all scoped
 * to the requesting user's visibility (admin = all, manager = their department):
 *   - a KPI row: total resolved, average resolution time, and active agents,
 *   - a support-performance table (assigned / resolved / resolution rate /
 *     avg resolution hrs) from `GET /dashboard/support-performance`,
 *   - distribution charts by status (bar), priority (pie), and category (bar),
 *     reusing the dashboard endpoints.
 *
 * Route-level RBAC (manager/admin only) is enforced by `RoleRoute` in the
 * router; this component additionally fails closed if rendered for another role.
 * Every section has explicit loading, error (retry), and empty states.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Inbox,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import * as dashboardApi from '@/api/dashboard';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { StatCard } from '@/components/StatCard';
import { DataTable, type Column } from '@/components/DataTable';
import { Loading } from '@/components/Loading';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { Avatar } from '@/components/Avatar';
import { hoursToHuman } from '@/utils/format';
import type { ChartPoint, SupportPerformance } from '@/types/models';
import type { TicketCategory, TicketPriority, TicketStatus } from '@/types/enums';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  toTitleCase,
} from '@/types/enums';

/* -------------------------------------------------------------------------- */
/* Chart color palettes (mirror the Tailwind badge palette, CONTRACT §9)      */
/* -------------------------------------------------------------------------- */

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: '#3b82f6',
  in_progress: '#f59e0b',
  waiting_for_user: '#a855f7',
  resolved: '#22c55e',
  closed: '#94a3b8',
  cancelled: '#f43f5e',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: '#94a3b8',
  medium: '#3b82f6',
  high: '#f97316',
  critical: '#ef4444',
};

const CATEGORY_COLORS: Record<TicketCategory, string> = {
  hardware: '#64748b',
  software: '#6366f1',
  network: '#06b6d4',
  email: '#0ea5e9',
  account_access: '#f59e0b',
  security: '#f43f5e',
  other: '#94a3b8',
};

/** Generic indigo accent for charts without a per-segment palette. */
const ACCENT = '#6366f1';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Normalize an unknown thrown value into a human-readable message. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Failed to load data. Please try again.';
}

/** A `ChartPoint` augmented with a display label + segment color. */
interface ChartDatum extends ChartPoint {
  display: string;
  color: string;
}

/** Map raw API points to chart-ready data with resolved labels + colors. */
function toChartData(
  points: ChartPoint[],
  labels: Record<string, string>,
  colors: Record<string, string>,
): ChartDatum[] {
  return points.map((point) => ({
    ...point,
    display: labels[point.label] ?? toTitleCase(point.label),
    color: colors[point.label] ?? ACCENT,
  }));
}

/** True when every data point is zero (or the array is empty). */
function isEmpty(points: ChartPoint[]): boolean {
  return points.every((p) => p.value === 0);
}

/** Per-section async state container. */
interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

const INITIAL_CHART: AsyncState<ChartPoint[]> = {
  data: [],
  loading: true,
  error: null,
};

/** Resolution rate (resolved / assigned) as a 0–100 percentage string. */
function resolutionRate(row: SupportPerformance): string {
  if (row.assigned <= 0) return '—';
  const pct = Math.round((row.resolved / row.assigned) * 100);
  return `${pct}%`;
}

/* -------------------------------------------------------------------------- */
/* Shared chart tooltip                                                       */
/* -------------------------------------------------------------------------- */

interface TooltipPayloadItem {
  payload: ChartDatum;
  value: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const datum = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: datum.color }}
        />
        <span className="font-medium text-slate-700">{datum.display}</span>
      </div>
      <p className="mt-0.5 text-slate-500">
        {datum.value} {datum.value === 1 ? 'ticket' : 'tickets'}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chart card wrapper                                                         */
/* -------------------------------------------------------------------------- */

interface ChartCardProps {
  title: string;
  subtitle?: string;
  loading: boolean;
  error: string | null;
  empty: boolean;
  onRetry: () => void;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({
  title,
  subtitle,
  loading,
  error,
  empty,
  onRetry,
  children,
  className,
}: ChartCardProps) {
  return (
    <Card title={title} subtitle={subtitle} className={className}>
      <div className="h-64 w-full">
        {loading ? (
          <Loading className="min-h-[16rem]" />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : empty ? (
          <EmptyState
            icon={Inbox}
            title="No data yet"
            message="There are no tickets in scope to chart."
          />
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Support-performance table columns                                          */
/* -------------------------------------------------------------------------- */

const performanceColumns: Column<SupportPerformance>[] = [
  {
    key: 'full_name',
    header: 'Agent',
    render: (row) => (
      <div className="flex items-center gap-3">
        <Avatar name={row.full_name} size="sm" />
        <span className="font-medium text-slate-900">{row.full_name}</span>
      </div>
    ),
  },
  {
    key: 'assigned',
    header: 'Assigned',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => row.assigned,
  },
  {
    key: 'resolved',
    header: 'Resolved',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => row.resolved,
  },
  {
    key: 'rate',
    header: 'Resolution Rate',
    align: 'right',
    className: 'tabular-nums text-slate-600',
    render: (row) => resolutionRate(row),
  },
  {
    key: 'avg_resolution_hours',
    header: 'Avg. Resolution',
    align: 'right',
    className: 'tabular-nums text-slate-600',
    render: (row) => hoursToHuman(row.avg_resolution_hours),
  },
];

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export function Reports() {
  const { hasRole } = useAuth();
  const canView = hasRole('manager', 'admin');

  const [performance, setPerformance] = useState<AsyncState<SupportPerformance[]>>({
    data: [],
    loading: true,
    error: null,
  });
  const [byStatus, setByStatus] = useState<AsyncState<ChartPoint[]>>(INITIAL_CHART);
  const [byPriority, setByPriority] = useState<AsyncState<ChartPoint[]>>(INITIAL_CHART);
  const [byCategory, setByCategory] = useState<AsyncState<ChartPoint[]>>(INITIAL_CHART);

  const loadPerformance = useCallback(async () => {
    setPerformance((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await dashboardApi.supportPerformance();
      setPerformance({ data, loading: false, error: null });
    } catch (err) {
      setPerformance({ data: [], loading: false, error: errorMessage(err) });
    }
  }, []);

  const loadByStatus = useCallback(async () => {
    setByStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await dashboardApi.byStatus();
      setByStatus({ data, loading: false, error: null });
    } catch (err) {
      setByStatus({ data: [], loading: false, error: errorMessage(err) });
    }
  }, []);

  const loadByPriority = useCallback(async () => {
    setByPriority((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await dashboardApi.byPriority();
      setByPriority({ data, loading: false, error: null });
    } catch (err) {
      setByPriority({ data: [], loading: false, error: errorMessage(err) });
    }
  }, []);

  const loadByCategory = useCallback(async () => {
    setByCategory((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await dashboardApi.byCategory();
      setByCategory({ data, loading: false, error: null });
    } catch (err) {
      setByCategory({ data: [], loading: false, error: errorMessage(err) });
    }
  }, []);

  const loadAll = useCallback(() => {
    void loadPerformance();
    void loadByStatus();
    void loadByPriority();
    void loadByCategory();
  }, [loadPerformance, loadByStatus, loadByPriority, loadByCategory]);

  useEffect(() => {
    if (canView) {
      loadAll();
    }
  }, [canView, loadAll]);

  const statusData = useMemo(
    () => toChartData(byStatus.data, STATUS_LABELS, STATUS_COLORS),
    [byStatus.data],
  );
  const priorityData = useMemo(
    () => toChartData(byPriority.data, PRIORITY_LABELS, PRIORITY_COLORS),
    [byPriority.data],
  );
  const categoryData = useMemo(
    () => toChartData(byCategory.data, CATEGORY_LABELS, CATEGORY_COLORS),
    [byCategory.data],
  );

  /**
   * KPI summary derived from the performance rows: aggregate resolved count,
   * a weighted average resolution time (weighted by resolved volume so busy
   * agents count more), and the number of agents who have resolved anything.
   */
  const kpis = useMemo(() => {
    const rows = performance.data;
    const totalResolved = rows.reduce((sum, r) => sum + r.resolved, 0);
    const totalAssigned = rows.reduce((sum, r) => sum + r.assigned, 0);
    const activeAgents = rows.filter((r) => r.assigned > 0).length;

    // Weighted mean of avg_resolution_hours over agents who resolved >0.
    let weightedSum = 0;
    let weight = 0;
    for (const r of rows) {
      if (r.avg_resolution_hours !== null && r.resolved > 0) {
        weightedSum += r.avg_resolution_hours * r.resolved;
        weight += r.resolved;
      }
    }
    const avgResolutionHours = weight > 0 ? weightedSum / weight : null;

    return { totalResolved, totalAssigned, activeAgents, avgResolutionHours };
  }, [performance.data]);

  // Fail closed: route guard should prevent this, but never render data for
  // an unauthorized role if the component is reached directly.
  if (!canView) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reports</h1>
        </div>
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Reports are restricted"
            message="Only managers and administrators can view performance reports."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Support-team performance and ticket distribution across your view.
        </p>
      </div>

      {/* KPI row */}
      {performance.loading ? (
        <Card>
          <Loading message="Loading KPIs…" className="min-h-[8rem]" />
        </Card>
      ) : performance.error ? (
        <Card>
          <ErrorState message={performance.error} onRetry={loadPerformance} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Tickets Resolved"
            value={kpis.totalResolved}
            icon={CheckCircle2}
            tone="green"
          />
          <StatCard
            label="Tickets Assigned"
            value={kpis.totalAssigned}
            icon={Inbox}
            tone="indigo"
          />
          <StatCard
            label="Avg. Resolution Time"
            value={hoursToHuman(kpis.avgResolutionHours)}
            icon={Clock}
            tone="amber"
          />
          <StatCard
            label="Active Agents"
            value={kpis.activeAgents}
            icon={Users}
            tone="violet"
          />
        </div>
      )}

      {/* Support performance table */}
      <Card
        title="Support Performance"
        subtitle="Per-agent assignment and resolution metrics"
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            {performance.data.length}{' '}
            {performance.data.length === 1 ? 'agent' : 'agents'}
          </span>
        }
        noPadding
      >
        <DataTable<SupportPerformance>
          columns={performanceColumns}
          rows={performance.data}
          loading={performance.loading}
          error={performance.error}
          onRetry={loadPerformance}
          rowKey={(row) => row.user_id}
          emptyTitle="No support activity"
          emptyMessage="There is no support-agent activity to report in your view yet."
          className="rounded-t-none border-0 shadow-none"
        />
      </Card>

      {/* Distribution charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Tickets by Status"
          subtitle="Distribution across the ticket lifecycle"
          loading={byStatus.loading}
          error={byStatus.error}
          empty={isEmpty(byStatus.data)}
          onRetry={loadByStatus}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={statusData}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <XAxis
                dataKey="display"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                interval={0}
                height={48}
                angle={-20}
                textAnchor="end"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: 'rgba(99,102,241,0.06)' }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                {statusData.map((entry) => (
                  <Cell key={entry.label} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Tickets by Priority"
          subtitle="Share of tickets at each priority level"
          loading={byPriority.loading}
          error={byPriority.error}
          empty={isEmpty(byPriority.data)}
          onRetry={loadByPriority}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={priorityData}
                dataKey="value"
                nameKey="display"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={82}
                paddingAngle={2}
                stroke="#ffffff"
                strokeWidth={2}
              >
                {priorityData.map((entry) => (
                  <Cell key={entry.label} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={28}
                iconType="circle"
                iconSize={9}
                formatter={(value: string) => (
                  <span className="text-xs text-slate-600">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Tickets by Category"
          subtitle="Where tickets are coming from"
          loading={byCategory.loading}
          error={byCategory.error}
          empty={isEmpty(byCategory.data)}
          onRetry={loadByCategory}
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={categoryData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                type="category"
                dataKey="display"
                tick={{ fontSize: 11, fill: '#475569' }}
                tickLine={false}
                axisLine={false}
                width={108}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: 'rgba(99,102,241,0.06)' }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {categoryData.map((entry) => (
                  <Cell key={entry.label} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

export default Reports;
