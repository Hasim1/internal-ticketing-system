/**
 * Dashboard — role-aware overview page (CONTRACT §9, route `/dashboard`).
 *
 * Renders, scoped to the current user's visibility (enforced server-side):
 *   - a row of {@link StatCard} metric tiles (total / open / in_progress /
 *     resolved / critical / unassigned) sourced from `GET /dashboard/stats`,
 *   - a bar chart of tickets-by-status, a pie of tickets-by-priority, and a bar
 *     of tickets-by-category (Recharts),
 *   - a "recent tickets" table (first page of `GET /tickets`, newest first).
 *
 * Every data section is fetched in parallel and surfaces explicit loading,
 * error (with retry), and empty states. Chart segment colors reuse the canonical
 * status/priority/category palettes so they stay consistent with the badges.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Inbox,
  Loader2,
  Ticket as TicketIcon,
  UserX,
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
import * as ticketsApi from '@/api/tickets';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';
import { DataTable, type Column } from '@/components/DataTable';
import { Loading } from '@/components/Loading';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { relativeTime, hoursToHuman } from '@/utils/format';
import type { ChartPoint, DashboardStats, Ticket } from '@/types/models';
import type { TicketCategory, TicketPriority, TicketStatus } from '@/types/enums';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  toTitleCase,
} from '@/types/enums';

/* -------------------------------------------------------------------------- */
/* Chart color palettes                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Hex colors mirroring the Tailwind badge palette (CONTRACT §9) so chart
 * segments read the same as the status/priority/category badges elsewhere.
 * Keyed by the raw enum string the API returns in `ChartPoint.label`.
 */
const STATUS_COLORS: Record<TicketStatus, string> = {
  open: '#3b82f6', // blue-500
  in_progress: '#f59e0b', // amber-500
  waiting_for_user: '#a855f7', // purple-500
  resolved: '#22c55e', // green-500
  closed: '#94a3b8', // slate-400
  cancelled: '#f43f5e', // rose-500
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: '#94a3b8', // slate-400
  medium: '#3b82f6', // blue-500
  high: '#f97316', // orange-500
  critical: '#ef4444', // red-500
};

const CATEGORY_COLORS: Record<TicketCategory, string> = {
  hardware: '#64748b', // slate-500
  software: '#6366f1', // indigo-500
  network: '#06b6d4', // cyan-500
  email: '#0ea5e9', // sky-500
  account_access: '#f59e0b', // amber-500
  security: '#f43f5e', // rose-500
  other: '#94a3b8', // slate-400
};

/** Generic indigo accent used for charts/bars without a per-segment palette. */
const ACCENT = '#6366f1'; // indigo-500

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Normalize an unknown thrown value into a human-readable message. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Failed to load data. Please try again.';
}

/**
 * A `ChartPoint` augmented with a display label and a fixed segment color,
 * computed from the raw enum string the API returns in `label`.
 */
interface ChartDatum extends ChartPoint {
  /** Title Case label for axes/tooltips/legend. */
  display: string;
  /** Hex color for this segment. */
  color: string;
}

/**
 * Map raw API `ChartPoint[]` to chart-ready data, resolving each point's
 * display label and color from the supplied label/color maps. Unknown labels
 * fall back to a Title Case label and the accent color so the chart never
 * breaks on an unexpected enum member.
 */
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

/* -------------------------------------------------------------------------- */
/* Recent-tickets table columns                                               */
/* -------------------------------------------------------------------------- */

const RECENT_LIMIT = 8;

const recentColumns: Column<Ticket>[] = [
  {
    key: 'id',
    header: '#',
    widthClassName: 'w-16',
    className: 'font-medium text-slate-500',
    render: (t) => `#${t.id}`,
  },
  {
    key: 'title',
    header: 'Title',
    render: (t) => (
      <div className="min-w-0">
        <Link
          to={`/tickets/${t.id}`}
          className="block max-w-xs truncate font-medium text-slate-900 hover:text-indigo-600"
          onClick={(e) => e.stopPropagation()}
        >
          {t.title}
        </Link>
        <p className="text-xs text-slate-400">{CATEGORY_LABELS[t.category]}</p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (t) => <StatusBadge status={t.status} />,
  },
  {
    key: 'priority',
    header: 'Priority',
    render: (t) => <PriorityBadge priority={t.priority} withIcon />,
  },
  {
    key: 'assigned_to',
    header: 'Assignee',
    render: (t) =>
      t.assigned_to ? (
        <span className="text-slate-700">{t.assigned_to.full_name}</span>
      ) : (
        <span className="text-slate-400">Unassigned</span>
      ),
  },
  {
    key: 'created_at',
    header: 'Created',
    align: 'right',
    className: 'text-slate-500 whitespace-nowrap',
    render: (t) => relativeTime(t.created_at),
  },
];

/* -------------------------------------------------------------------------- */
/* Chart tooltip                                                              */
/* -------------------------------------------------------------------------- */

interface TooltipPayloadItem {
  payload: ChartDatum;
  value: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

/** Compact, themed tooltip shared by all charts on this page. */
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

/**
 * Card that owns the loading / error / empty presentation for a single chart,
 * so each chart body only renders when there is data to show.
 */
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
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

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

export function Dashboard() {
  const { user } = useAuth();

  const [statsState, setStatsState] = useState<AsyncState<DashboardStats | null>>({
    data: null,
    loading: true,
    error: null,
  });
  const [byStatus, setByStatus] = useState<AsyncState<ChartPoint[]>>(INITIAL_CHART);
  const [byPriority, setByPriority] = useState<AsyncState<ChartPoint[]>>(INITIAL_CHART);
  const [byCategory, setByCategory] = useState<AsyncState<ChartPoint[]>>(INITIAL_CHART);
  const [recent, setRecent] = useState<AsyncState<Ticket[]>>({
    data: [],
    loading: true,
    error: null,
  });

  /** Fetch the headline stat counters. */
  const loadStats = useCallback(async () => {
    setStatsState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await dashboardApi.stats();
      setStatsState({ data, loading: false, error: null });
    } catch (err) {
      setStatsState({ data: null, loading: false, error: errorMessage(err) });
    }
  }, []);

  /** Fetch tickets grouped by status. */
  const loadByStatus = useCallback(async () => {
    setByStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await dashboardApi.byStatus();
      setByStatus({ data, loading: false, error: null });
    } catch (err) {
      setByStatus({ data: [], loading: false, error: errorMessage(err) });
    }
  }, []);

  /** Fetch tickets grouped by priority. */
  const loadByPriority = useCallback(async () => {
    setByPriority((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await dashboardApi.byPriority();
      setByPriority({ data, loading: false, error: null });
    } catch (err) {
      setByPriority({ data: [], loading: false, error: errorMessage(err) });
    }
  }, []);

  /** Fetch tickets grouped by category. */
  const loadByCategory = useCallback(async () => {
    setByCategory((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await dashboardApi.byCategory();
      setByCategory({ data, loading: false, error: null });
    } catch (err) {
      setByCategory({ data: [], loading: false, error: errorMessage(err) });
    }
  }, []);

  /** Fetch the first page of recent tickets (newest first). */
  const loadRecent = useCallback(async () => {
    setRecent((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await ticketsApi.list({
        page: 1,
        page_size: RECENT_LIMIT,
        sort: '-created_at',
      });
      setRecent({ data: page.items, loading: false, error: null });
    } catch (err) {
      setRecent({ data: [], loading: false, error: errorMessage(err) });
    }
  }, []);

  /** Kick off all section fetches in parallel. */
  const loadAll = useCallback(() => {
    void loadStats();
    void loadByStatus();
    void loadByPriority();
    void loadByCategory();
    void loadRecent();
  }, [loadStats, loadByStatus, loadByPriority, loadByCategory, loadRecent]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  const stats = statsState.data;
  const firstName = user?.full_name?.split(' ')[0] ?? 'there';

  /* The stat tiles: each reflects a counter from `DashboardStats`. The support-
   * only `my_open_assigned` tile is appended when the value is present. */
  const statTiles = useMemo(() => {
    if (!stats) return [];
    const tiles: Array<{
      label: string;
      value: number;
      icon: typeof TicketIcon;
      tone: React.ComponentProps<typeof StatCard>['tone'];
    }> = [
      { label: 'Total Tickets', value: stats.total_tickets, icon: TicketIcon, tone: 'indigo' },
      { label: 'Open', value: stats.open, icon: CircleDot, tone: 'blue' },
      { label: 'In Progress', value: stats.in_progress, icon: Loader2, tone: 'amber' },
      { label: 'Resolved', value: stats.resolved, icon: CheckCircle2, tone: 'green' },
      { label: 'Critical', value: stats.critical, icon: AlertTriangle, tone: 'rose' },
      { label: 'Unassigned', value: stats.unassigned, icon: UserX, tone: 'slate' },
    ];
    if (stats.my_open_assigned !== null && stats.my_open_assigned !== undefined) {
      tiles.push({
        label: 'My Open Assigned',
        value: stats.my_open_assigned,
        icon: Inbox,
        tone: 'violet',
      });
    }
    return tiles;
  }, [stats]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here's an overview of the tickets in your view, plus the average time to
          resolution.
        </p>
      </div>

      {/* Stat tiles */}
      {statsState.loading ? (
        <Card>
          <Loading message="Loading metrics…" className="min-h-[8rem]" />
        </Card>
      ) : statsState.error ? (
        <Card>
          <ErrorState message={statsState.error} onRetry={loadStats} />
        </Card>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {statTiles.map((tile) => (
            <StatCard
              key={tile.label}
              label={tile.label}
              value={tile.value}
              icon={tile.icon}
              tone={tile.tone}
            />
          ))}
          <StatCard
            label="Avg. Resolution Time"
            value={hoursToHuman(stats.avg_resolution_hours)}
            icon={CheckCircle2}
            tone="green"
          />
        </div>
      ) : null}

      {/* Charts: status (bar), priority (pie), category (bar) */}
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

      {/* Recent tickets */}
      <Card
        title="Recent Tickets"
        subtitle="The latest tickets in your view"
        actions={
          <Link
            to="/tickets"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all
          </Link>
        }
        noPadding
      >
        <DataTable<Ticket>
          columns={recentColumns}
          rows={recent.data}
          loading={recent.loading}
          error={recent.error}
          onRetry={loadRecent}
          rowKey={(t) => t.id}
          emptyTitle="No tickets yet"
          emptyMessage="Tickets you create or that are assigned to you will appear here."
          className="rounded-t-none border-0 shadow-none"
        />
      </Card>
    </div>
  );
}

export default Dashboard;
