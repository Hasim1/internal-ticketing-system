/**
 * `RoleRoute` — gate routes behind one or more roles (CONTRACT §9).
 *
 * Assumes it is rendered *inside* a {@link ProtectedRoute} (i.e. the user is
 * already authenticated). If, defensively, no user is present it falls back to
 * `/login`. When the authenticated user's role is not in `allowed`, it
 * redirects to `/403`.
 *
 * Renders the matched child routes via `<Outlet/>` (or explicit `children`).
 */

import { Navigate, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/Spinner';
import type { UserRole } from '@/types/enums';

/** Props for {@link RoleRoute}. */
export interface RoleRouteProps {
  /** Roles permitted to view the nested routes. */
  allowed: UserRole[];
  /**
   * Optional explicit children. When omitted, the matched child routes render
   * through `<Outlet/>`.
   */
  children?: ReactNode;
}

/**
 * Allow through only users whose role is in `allowed`; otherwise redirect to
 * `/403`. Waits for auth hydration to avoid a premature redirect.
 */
export function RoleRoute({ allowed, children }: RoleRouteProps) {
  const { user, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" label="Checking permissions" />
      </div>
    );
  }

  // Should be guarded by ProtectedRoute already; redirect defensively.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!hasRole(...allowed)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

export default RoleRoute;
