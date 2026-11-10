/**
 * `App` — root of the Internal Ticketing & Support Management System frontend.
 *
 * Owns the entire provider stack and the React Router v6 route tree
 * (CONTRACT §9). Layered as:
 *
 *   <BrowserRouter>          — history + URL
 *     <AuthProvider>         — current user / token / login / logout
 *       <ToastProvider>      — global toast notifications
 *         <AppRoutes/>       — the route table below
 *
 * AuthProvider sits above ToastProvider so auth-driven side effects can run
 * without a toast dependency, and both sit inside BrowserRouter so any
 * provider may use router hooks (e.g. redirects) if needed.
 *
 * Route table:
 *   Public:
 *     /login                 Login
 *     /register              Register
 *   Protected (auth required, rendered inside DashboardLayout):
 *     /                      → redirect to /dashboard
 *     /dashboard             Dashboard
 *     /tickets               Tickets
 *     /tickets/new           CreateTicket
 *     /tickets/:id           TicketDetails
 *     /profile               Profile
 *   Admin only:
 *     /admin/users           AdminUsers
 *     /admin/departments     AdminDepartments
 *     /admin/audit-logs      AdminAuditLogs
 *   Manager + Admin:
 *     /reports               Reports
 *   Misc:
 *     /403                   Forbidden
 *     *                      NotFound
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';

import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { RoleRoute } from '@/routes/RoleRoute';
import { DashboardLayout } from '@/layouts/DashboardLayout';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Tickets from '@/pages/Tickets';
import CreateTicket from '@/pages/CreateTicket';
import TicketDetails from '@/pages/TicketDetails';
import Profile from '@/pages/Profile';
import Reports from '@/pages/Reports';
import Forbidden from '@/pages/Forbidden';
import NotFound from '@/pages/NotFound';
import AdminUsers from '@/pages/admin/Users';
import AdminDepartments from '@/pages/admin/Departments';
import AdminAuditLogs from '@/pages/admin/AuditLogs';

/**
 * The application route table. Kept as its own component so it renders *inside*
 * the router and provider stack and may freely use router hooks.
 */
function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Forbidden page (reachable while authenticated or not) */}
      <Route path="/403" element={<Forbidden />} />

      {/* Protected app shell: requires auth, renders pages inside DashboardLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          {/* Index → dashboard */}
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* All authenticated roles */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="tickets/new" element={<CreateTicket />} />
          <Route path="tickets/:id" element={<TicketDetails />} />
          <Route path="profile" element={<Profile />} />

          {/* Manager + Admin */}
          <Route element={<RoleRoute allowed={['manager', 'admin']} />}>
            <Route path="reports" element={<Reports />} />
          </Route>

          {/* Admin only */}
          <Route element={<RoleRoute allowed={['admin']} />}>
            <Route path="admin">
              <Route path="users" element={<AdminUsers />} />
              <Route path="departments" element={<AdminDepartments />} />
              <Route path="audit-logs" element={<AdminAuditLogs />} />
            </Route>
          </Route>
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/**
 * Root component. Composes the router + providers and renders the route table.
 * `main.tsx` mounts this directly; it owns all global context.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
