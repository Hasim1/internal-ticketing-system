/**
 * Tickets list page (`/tickets`).
 *
 * Renders a filterable, paginated table of tickets visible to the current user.
 * RBAC visibility is enforced server-side (CONTRACT §5) — this page simply calls
 * `tickets.list` with the active filters and renders whatever the API returns.
 *
 * Filters: status, priority, category, free-text search, and (for staff roles:
 * support / manager / admin) optional "assigned to" and "department" selectors.
 * Each filter change resets the page to 1. Clicking a row navigates to the
 * ticket detail view; the "New Ticket" button routes to the create form.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Ticket as TicketIcon } from 'lucide-react';

import * as ticketsApi from '@/api/tickets';
import type { TicketListParams } from '@/api/tickets';
import * as usersApi from '@/api/users';
import * as departmentsApi from '@/api/departments';

import type { Department, Paginated, Ticket, UserBrief } from '@/types/models';
import type { TicketCategory, TicketPriority, TicketStatus } from '@/types/enums';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '@/types/enums';

import { useAuth } from '@/hooks/useAuth';

import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { Pagination } from '@/components/Pagination';
import { PriorityBadge } from '@/components/PriorityBadge';
import { SearchBar } from '@/components/SearchBar';
import { Select } from '@/components/Select';
import { StatusBadge } from '@/components/StatusBadge';

import { categoryLabel } from '@/utils/labels';
import { formatDate, relativeTime } from '@/utils/format';

/** Number of tickets requested per page. */
const PAGE_SIZE = 20;

/** Sentinel value for "no filter" in the <select> controls. */
const ANY = '';

/** Local shape for the page's filter state (all optional). */
interface Filters {
  status: TicketStatus | '';
  priority: TicketPriority | '';
  category: TicketCategory | '';
  search: string;
  assigned_to_id: string;
  department_id: string;
}

const EMPTY_FILTERS: Filters = {
  status: ANY,
  priority: ANY,
  category: ANY,
  search: '',
  assigned_to_id: ANY,
  department_id: ANY,
};

/** Extract a human-readable message from an unknown (likely Axios) error. */
function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    const maybe = err as {
      response?: { data?: { detail?: unknown } };
      message?: string;
    };
    const detail = maybe.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    if (typeof maybe.message === 'string') return maybe.message;
  }
  return fallback;
}

export function Tickets() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();

  // Staff roles get the extra "assigned to" / "department" filters and see the
  // assignee column. Employees only ever see their own tickets, so those
  // filters would be meaningless for them.
  const isStaff = hasRole('support', 'manager', 'admin');

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState<number>(1);

  const [result, setResult] = useState<Paginated<Ticket> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Lookup data for the staff-only filters. Loaded once; failures are silent
  // (the dependent filters simply stay empty rather than breaking the page).
  const [supportUsers, setSupportUsers] = useState<UserBrief[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  /** Build the API query params from the current filter + page state. */
  const params = useMemo<TicketListParams>(() => {
    const next: TicketListParams = {
      page,
      page_size: PAGE_SIZE,
      sort: '-created_at',
    };
    if (filters.status) next.status = filters.status;
    if (filters.priority) next.priority = filters.priority;
    if (filters.category) next.category = filters.category;
    if (filters.search.trim()) next.search = filters.search.trim();
    if (isStaff && filters.assigned_to_id) {
      next.assigned_to_id = Number(filters.assigned_to_id);
    }
    if (isStaff && filters.department_id) {
      next.department_id = Number(filters.department_id);
    }
    return next;
  }, [filters, page, isStaff]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ticketsApi.list(params);
      setResult(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load tickets.'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  // Load filter lookups once for staff users.
  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;

    async function loadLookups() {
      try {
        const [supportPage, depts] = await Promise.all([
          usersApi.list({ role: 'support', page: 1, page_size: 100 }),
          departmentsApi.list(),
        ]);
        if (cancelled) return;
        setSupportUsers(supportPage.items);
        setDepartments(depts);
      } catch {
        // Non-fatal: the dependent selects just render with no options.
        if (!cancelled) {
          setSupportUsers([]);
          setDepartments([]);
        }
      }
    }

    void loadLookups();
    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  /** Update a single filter and reset pagination to the first page. */
  const updateFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.status ||
          filters.priority ||
          filters.category ||
          filters.search.trim() ||
          (isStaff && (filters.assigned_to_id || filters.department_id)),
      ),
    [filters, isStaff],
  );

  // Select option lists derived from the enums (with a leading "Any" option).
  const statusOptions = useMemo(
    () => [
      { value: ANY, label: 'Any status' },
      ...TICKET_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
    ],
    [],
  );
  const priorityOptions = useMemo(
    () => [
      { value: ANY, label: 'Any priority' },
      ...TICKET_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
    ],
    [],
  );
  const categoryOptions = useMemo(
    () => [
      { value: ANY, label: 'Any category' },
      ...TICKET_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
    ],
    [],
  );
  const assigneeOptions = useMemo(
    () => [
      { value: ANY, label: 'Any assignee' },
      ...supportUsers.map((u) => ({ value: String(u.id), label: u.full_name })),
    ],
    [supportUsers],
  );
  const departmentOptions = useMemo(
    () => [
      { value: ANY, label: 'Any department' },
      ...departments.map((d) => ({ value: String(d.id), label: d.name })),
    ],
    [departments],
  );

  /** Column definitions for the tickets table. */
  const columns = useMemo<Column<Ticket>[]>(() => {
    const cols: Column<Ticket>[] = [
      {
        key: 'id',
        header: 'ID',
        widthClassName: 'w-16',
        className: 'text-slate-400 font-mono',
        render: (t) => `#${t.id}`,
      },
      {
        key: 'title',
        header: 'Title',
        render: (t) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{t.title}</p>
            <p className="truncate text-xs text-slate-500">
              {categoryLabel(t.category)} · {t.created_by.full_name}
            </p>
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
    ];

    if (isStaff) {
      cols.push({
        key: 'assigned_to',
        header: 'Assignee',
        render: (t) =>
          t.assigned_to ? (
            <span className="text-slate-700">{t.assigned_to.full_name}</span>
          ) : (
            <span className="text-slate-400">Unassigned</span>
          ),
      });
    }

    cols.push({
      key: 'created_at',
      header: 'Created',
      align: 'right',
      widthClassName: 'w-40',
      render: (t) => (
        <span title={formatDate(t.created_at)} className="whitespace-nowrap text-slate-500">
          {relativeTime(t.created_at)}
        </span>
      ),
    });

    return cols;
  }, [isStaff]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tickets</h1>
          <p className="mt-1 text-sm text-slate-500">
            Browse and manage support tickets.
          </p>
        </div>
        <Button
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => navigate('/tickets/new')}
        >
          New Ticket
        </Button>
      </div>

      {/* Filters */}
      <FilterBar onReset={resetFilters} hasActiveFilters={hasActiveFilters}>
        <SearchBar
          value={filters.search}
          onChange={(value) => updateFilter('search', value)}
          placeholder="Search title or description…"
          className="w-full sm:w-64"
        />
        <Select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => updateFilter('status', e.target.value as Filters['status'])}
          options={statusOptions}
          containerClassName="w-full sm:w-44"
        />
        <Select
          aria-label="Filter by priority"
          value={filters.priority}
          onChange={(e) => updateFilter('priority', e.target.value as Filters['priority'])}
          options={priorityOptions}
          containerClassName="w-full sm:w-44"
        />
        <Select
          aria-label="Filter by category"
          value={filters.category}
          onChange={(e) => updateFilter('category', e.target.value as Filters['category'])}
          options={categoryOptions}
          containerClassName="w-full sm:w-44"
        />
        {isStaff && (
          <>
            <Select
              aria-label="Filter by assignee"
              value={filters.assigned_to_id}
              onChange={(e) => updateFilter('assigned_to_id', e.target.value)}
              options={assigneeOptions}
              containerClassName="w-full sm:w-48"
            />
            <Select
              aria-label="Filter by department"
              value={filters.department_id}
              onChange={(e) => updateFilter('department_id', e.target.value)}
              options={departmentOptions}
              containerClassName="w-full sm:w-48"
            />
          </>
        )}
      </FilterBar>

      {/* Table */}
      <DataTable<Ticket>
        columns={columns}
        rows={result?.items ?? []}
        rowKey={(t) => t.id}
        loading={loading}
        error={error}
        onRetry={fetchTickets}
        onRowClick={(t) => navigate(`/tickets/${t.id}`)}
        emptyTitle="No tickets found"
        emptyMessage={
          hasActiveFilters
            ? 'No tickets match the current filters. Try clearing them.'
            : 'There are no tickets to show yet. Create your first ticket to get started.'
        }
        emptyAction={
          <Button
            leftIcon={<TicketIcon className="h-4 w-4" />}
            onClick={() => navigate('/tickets/new')}
          >
            New Ticket
          </Button>
        }
      />

      {/* Pagination (only meaningful once we have a result) */}
      {result && !loading && !error && result.total > 0 && (
        <Pagination
          page={result.page}
          pages={result.pages}
          total={result.total}
          pageSize={result.page_size}
          onChange={setPage}
        />
      )}
    </div>
  );
}

export default Tickets;
