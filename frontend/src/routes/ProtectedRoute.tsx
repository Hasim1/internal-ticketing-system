/**
 * `ProtectedRoute` — gate routes that require authentication (CONTRACT §9).
 *
 * While the auth context is still hydrating (`loading`), a full-screen spinner
 * is shown so we never flash a redirect before the session is known. Once
 * settled, unauthenticated users are redirected to `/login` (remembering where
 * they came from so the login page can return them), and authenticated users
 * see the nested routes via `<Outlet/>` (or `children` if provided).
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/Spinner';

/** Props for {@link ProtectedRoute}. */
export interface ProtectedRouteProps {
  /**
   * Optional explicit children. When omitted, the matched child routes render
   * through `<Outlet/>` (the common React Router v6 layout-route pattern).
   */
  children?: ReactNode;
}

/** Centered full-viewport loading state shown during auth hydration. */
function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Spinner size="lg" label="Checking your session" />
    </div>
  );
}

/**
 * Redirect to `/login` unless the user is authenticated. Waits for the auth
 * context to finish loading before deciding.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    // Preserve the attempted location so /login can redirect back after sign-in.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children ?? <Outlet />}</>;
}

export default ProtectedRoute;
