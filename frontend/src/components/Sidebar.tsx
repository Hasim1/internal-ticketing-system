/**
 * `Sidebar` — role-aware primary navigation (CONTRACT §9).
 *
 * Renders the app's nav links using react-router `NavLink` (active styling),
 * filtered by the current user's role:
 *   - everyone: Dashboard, Tickets, New Ticket, Profile
 *   - manager/admin: Reports
 *   - admin: Users, Departments, Audit Logs
 *
 * The same component serves both the static desktop rail and the mobile drawer;
 * `onNavigate` lets the parent close the drawer after a link is tapped.
 */

import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
  UserCircle,
  Users,
  Building2,
  BarChart3,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/enums';

/** A single navigation entry. */
interface NavItem {
  /** Destination path. */
  to: string;
  /** Visible label. */
  label: string;
  /** Leading icon. */
  icon: LucideIcon;
  /**
   * Roles allowed to see this item. When omitted, the item is visible to every
   * authenticated user.
   */
  roles?: UserRole[];
  /**
   * Whether `NavLink` should match this route exactly (`end`). Used so
   * `/tickets` does not stay highlighted while on `/tickets/new`.
   */
  end?: boolean;
}

/** The full nav model; filtered per-role at render time. */
const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tickets', label: 'Tickets', icon: ClipboardList, end: true },
  { to: '/tickets/new', label: 'New Ticket', icon: FilePlus2 },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['manager', 'admin'] },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
  { to: '/admin/departments', label: 'Departments', icon: Building2, roles: ['admin'] },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, roles: ['admin'] },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

/** Props for {@link Sidebar}. */
export interface SidebarProps {
  /** Invoked after a nav link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void;
}

/**
 * The navigation list. Stateless and reusable across desktop + mobile shells.
 */
export function Sidebar({ onNavigate }: SidebarProps) {
  const { user, hasRole } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user !== null && hasRole(...item.roles)),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-800">Helpdesk</p>
          <p className="text-xs text-slate-400">Support Center</p>
        </div>
      </div>

      {/* Links */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        {visibleItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={clsx(
                    'h-[18px] w-[18px] shrink-0 transition',
                    isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600',
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-200 px-5 py-3">
        <p className="text-xs text-slate-400">
          Internal Ticketing &amp; Support
        </p>
      </div>
    </div>
  );
}

export default Sidebar;
