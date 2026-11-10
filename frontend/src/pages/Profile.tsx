/**
 * Profile page (CONTRACT §9 — route `/profile`, any authenticated user).
 *
 * Read-only summary of the signed-in user's account, sourced entirely from the
 * auth context (`useAuth`): name, email, role, department, account status, and
 * "member since" date. No API calls are made here — the session already carries
 * the full `User` record.
 */

import {
  AtSign,
  Building2,
  CalendarDays,
  CheckCircle2,
  ShieldCheck,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { formatDate, relativeTime } from '@/utils/format';

import { Avatar } from '@/components/Avatar';
import { RoleBadge } from '@/components/RoleBadge';
import { Loading } from '@/components/Loading';
import { ErrorState } from '@/components/ErrorState';

/** A single labelled detail row inside the profile card. */
function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-slate-900">{children}</div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading message="Loading your profile…" />;
  }

  if (!user) {
    // Should not happen behind a ProtectedRoute, but degrade gracefully.
    return (
      <ErrorState
        title="Not signed in"
        message="We couldn't load your profile. Try signing in again."
      />
    );
  }

  const departmentName = user.department?.name ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Your account details and access level.</p>
      </div>

      {/* Identity banner */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col items-center gap-4 border-b border-slate-100 bg-gradient-to-br from-indigo-50 to-white px-6 py-8 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left">
          <Avatar name={user.full_name} size="lg" className="h-16 w-16 text-xl" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-slate-900">{user.full_name}</h2>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
            <div className="mt-2 flex items-center justify-center gap-2 sm:justify-start">
              <RoleBadge role={user.role} />
              {user.is_active ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="divide-y divide-slate-100 px-6 py-2">
          <DetailRow icon={<UserIcon className="h-4 w-4" />} label="Full name">
            {user.full_name}
          </DetailRow>

          <DetailRow icon={<AtSign className="h-4 w-4" />} label="Email">
            {user.email}
          </DetailRow>

          <DetailRow icon={<ShieldCheck className="h-4 w-4" />} label="Role">
            <RoleBadge role={user.role} />
          </DetailRow>

          <DetailRow icon={<Building2 className="h-4 w-4" />} label="Department">
            {departmentName ?? (
              <span className="italic text-slate-400">No department assigned</span>
            )}
          </DetailRow>

          <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Member since">
            <span className="text-slate-900">{formatDate(user.created_at)}</span>
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({relativeTime(user.created_at)})
            </span>
          </DetailRow>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">
        Need to change your details? Contact an administrator.
      </p>
    </div>
  );
}
