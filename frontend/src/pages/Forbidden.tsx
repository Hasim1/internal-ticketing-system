/**
 * Forbidden (403) page (CONTRACT §9 — route `/403`).
 *
 * Shown when a `RoleRoute` blocks a user whose role is not permitted for the
 * requested area. Offers a clear path back to the dashboard.
 */

import { Link } from 'react-router-dom';
import { LayoutDashboard, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/Button';

export default function Forbidden() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <ShieldAlert className="h-8 w-8" aria-hidden="true" />
      </div>

      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-rose-500">
        Error 403
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Access denied</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        You don't have permission to view this page. If you believe this is a mistake, contact
        your administrator.
      </p>

      <Link to="/dashboard" className="mt-6">
        <Button leftIcon={<LayoutDashboard className="h-4 w-4" />}>Back to dashboard</Button>
      </Link>
    </div>
  );
}
