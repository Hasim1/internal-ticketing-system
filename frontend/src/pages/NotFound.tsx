/**
 * Not Found (404) page (CONTRACT §9).
 *
 * Catch-all for unknown routes. Provides links back to the dashboard and the
 * tickets list so the user can recover from a mistyped or stale URL.
 */

import { Link } from 'react-router-dom';
import { Compass, LayoutDashboard, Ticket } from 'lucide-react';

import { Button } from '@/components/Button';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
        <Compass className="h-8 w-8" aria-hidden="true" />
      </div>

      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-indigo-500">
        Error 404
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        The page you're looking for doesn't exist or may have been moved.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link to="/dashboard">
          <Button leftIcon={<LayoutDashboard className="h-4 w-4" />}>Back to dashboard</Button>
        </Link>
        <Link to="/tickets">
          <Button variant="secondary" leftIcon={<Ticket className="h-4 w-4" />}>
            View tickets
          </Button>
        </Link>
      </div>
    </div>
  );
}
