/**
 * Admin · Audit logs page (CONTRACT §9 — route `/admin/audit-logs`, admin only).
 *
 * Paginated, filterable view of the audit trail. Each row shows the acting user,
 * the action (as a colored badge), the affected entity, an old → new value diff,
 * and a timestamp. Filters: action, entity type, and a created-at date range.
 *
 * All access goes through the typed `@/api/audit` module.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { ArrowRight, ScrollText } from 'lucide-react';

import * as auditApi from '@/api/audit';
import type { AuditListParams } from '@/api/audit';
import type { AuditLog, Paginated } from '@/types/models';
import type { AuditAction } from '@/types/enums';
import { AUDIT_ACTIONS, AUDIT_ACTION_BADGE, AUDIT_ACTION_LABELS } from '@/types/enums';
import { useToast } from '@/context/ToastContext';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime } from '@/utils/format';
import { auditActionLabel, genericLabel } from '@/utils/labels';

import { Avatar } from '@/components/Avatar';
import { Input } from '@/components/Input';
import { Select } from '@/components/Select';
import { FilterBar } from '@/components/FilterBar';
import { Pagination } from '@/components/Pagination';
import { DataTable, type Column } from '@/components/DataTable';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** "all" sentinel for select filters that map to "no filter". */
const ALL = 'all';

/**
 * Distinct entity types the backend records (CONTRACT §3 — `entity_type` column,
 * e.g. "ticket", "user", "department", "comment"). Used to populate the filter.
 */
const ENTITY_TYPES = ['ticket', 'user', 'department', 'comment'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

/** Pull a human-readable message out of an unknown (usually Axios) error. */
function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * Convert a `<input type="date">` value (`YYYY-MM-DD`) into an ISO-8601 string
 * for the API. `isEnd` pins the time to the end of the day so a `date_to` filter
 * is inclusive of the selected day.
 */
function dateToIso(value: string, isEnd = false): string | undefined {
  if (!value) return undefined;
  const time = isEnd ? 'T23:59:59' : 'T00:00:00';
  const date = new Date(`${value}${time}`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/** Render a single old/new value cell, truncating long blobs gracefully. */
function ValueChip({ value }: { value: string | null }) {
  if (value === null || value === '') {
    return <span className="text-xs italic text-slate-400">—</span>;
  }
  return (
    <span
      title={value}
      className="block max-w-[12rem] truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
    >
      {value}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function AdminAuditLogs() {
  const toast = useToast();
  const pagination = usePagination({ pageSize: 20 });
  const { page, pageSize, total, pageCount, setPage, setTotal, reset } = pagination;

  // ---- Filters -------------------------------------------------------------
  const [actionFilter, setActionFilter] = useState<AuditAction | typeof ALL>(ALL);
  const [entityFilter, setEntityFilter] = useState<EntityType | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ---- Data ----------------------------------------------------------------
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasActiveFilters =
    actionFilter !== ALL || entityFilter !== ALL || dateFrom !== '' || dateTo !== '';

  /** Build the query params for the current filter + pagination state. */
  const params = useMemo<AuditListParams>(() => {
    const next: AuditListParams = { page, page_size: pageSize };
    if (actionFilter !== ALL) next.action = actionFilter;
    if (entityFilter !== ALL) next.entity_type = entityFilter;
    const from = dateToIso(dateFrom, false);
    const to = dateToIso(dateTo, true);
    if (from) next.date_from = from;
    if (to) next.date_to = to;
    return next;
  }, [page, pageSize, actionFilter, entityFilter, dateFrom, dateTo]);

  /** Fetch the current page of audit logs. */
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: Paginated<AuditLog> = await auditApi.list(params);
      setLogs(data.items);
      setTotal(data.total);
    } catch (err) {
      const message = errorMessage(err, 'Failed to load audit logs.');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [params, setTotal, toast]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    reset();
  }, [actionFilter, entityFilter, dateFrom, dateTo, reset]);

  const resetFilters = () => {
    setActionFilter(ALL);
    setEntityFilter(ALL);
    setDateFrom('');
    setDateTo('');
  };

  // ---- Table columns -------------------------------------------------------
  const columns: Column<AuditLog>[] = useMemo(
    () => [
      {
        key: 'user',
        header: 'User',
        widthClassName: 'w-52',
        render: (log) =>
          log.user ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={log.user.full_name} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{log.user.full_name}</p>
                <p className="truncate text-xs text-slate-500">{log.user.email}</p>
              </div>
            </div>
          ) : (
            <span className="text-xs italic text-slate-400">System</span>
          ),
      },
      {
        key: 'action',
        header: 'Action',
        widthClassName: 'w-44',
        render: (log) => (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
              AUDIT_ACTION_BADGE[log.action] ??
              'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
            }`}
          >
            {auditActionLabel(log.action)}
          </span>
        ),
      },
      {
        key: 'entity',
        header: 'Entity',
        widthClassName: 'w-32',
        render: (log) => (
          <div className="text-sm">
            <span className="font-medium text-slate-700">{genericLabel(log.entity_type)}</span>
            {log.entity_id != null && (
              <span className="ml-1 text-slate-400">#{log.entity_id}</span>
            )}
          </div>
        ),
      },
      {
        key: 'change',
        header: 'Change',
        render: (log) => {
          // Only show a diff when at least one side carries a value.
          if (log.old_value === null && log.new_value === null) {
            return <span className="text-xs italic text-slate-400">—</span>;
          }
          return (
            <div className="flex items-center gap-2">
              <ValueChip value={log.old_value} />
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />
              <ValueChip value={log.new_value} />
            </div>
          );
        },
      },
      {
        key: 'created_at',
        header: 'Timestamp',
        align: 'right',
        widthClassName: 'w-44',
        render: (log) => (
          <span className="whitespace-nowrap text-slate-600">
            {formatDateTime(log.created_at)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ScrollText className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          Audit logs
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          A chronological record of every significant action across the system.
        </p>
      </div>

      {/* Filters */}
      <FilterBar onReset={resetFilters} hasActiveFilters={hasActiveFilters}>
        <Select
          aria-label="Filter by action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as AuditAction | typeof ALL)}
          containerClassName="w-full sm:w-52"
        >
          <option value={ALL}>All actions</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {AUDIT_ACTION_LABELS[action]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by entity type"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value as EntityType | typeof ALL)}
          containerClassName="w-full sm:w-44"
        >
          <option value={ALL}>All entities</option>
          {ENTITY_TYPES.map((entity) => (
            <option key={entity} value={entity}>
              {genericLabel(entity)}
            </option>
          ))}
        </Select>
        <Input
          aria-label="From date"
          label="From"
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => setDateFrom(e.target.value)}
          containerClassName="w-full sm:w-44"
        />
        <Input
          aria-label="To date"
          label="To"
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => setDateTo(e.target.value)}
          containerClassName="w-full sm:w-44"
        />
      </FilterBar>

      {/* Table */}
      <DataTable<AuditLog>
        columns={columns}
        rows={logs}
        rowKey={(log) => log.id}
        loading={loading}
        error={error}
        onRetry={fetchLogs}
        emptyTitle="No audit entries"
        emptyMessage={
          hasActiveFilters
            ? 'No log entries match the current filters.'
            : 'Activity will appear here as users interact with the system.'
        }
      />

      {/* Pagination */}
      {!loading && !error && logs.length > 0 && (
        <Pagination
          page={page}
          pages={pageCount}
          total={total}
          pageSize={pageSize}
          onChange={setPage}
        />
      )}
    </div>
  );
}
