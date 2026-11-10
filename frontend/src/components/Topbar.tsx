/**
 * `Topbar` — the dashboard header (CONTRACT §9).
 *
 * Shows the page chrome (mobile menu button + app title) on the left and a
 * profile dropdown on the right. The dropdown displays the signed-in user's
 * name + role badge and offers a Profile link and a Logout action via
 * `useAuth`. The menu closes on outside-click, on Escape, and after navigation.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChevronDown, LogOut, Menu, UserCircle } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { roleLabel } from '@/utils/labels';
import { ROLE_BADGE } from '@/types/enums';

/** Props for {@link Topbar}. */
export interface TopbarProps {
  /** Opens the mobile sidebar drawer (only rendered below `lg`). */
  onOpenSidebar: () => void;
}

/** Initials derived from a full name, for the avatar circle. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * The sticky top bar with the profile dropdown.
 */
export function Topbar({ onOpenSidebar }: TopbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function handleLogout() {
    setOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={onOpenSidebar}
        className="-ml-1 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <h1 className="truncate text-sm font-semibold text-slate-800 sm:text-base">
        Internal Ticketing &amp; Support
      </h1>

      <div className="ml-auto flex items-center">
        {user && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-xs font-semibold text-white">
                {initials(user.full_name)}
              </span>
              <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                <span className="truncate text-sm font-medium text-slate-700">
                  {user.full_name}
                </span>
                <span className="truncate text-xs text-slate-400">{user.email}</span>
              </span>
              <ChevronDown
                className={clsx(
                  'h-4 w-4 shrink-0 text-slate-400 transition-transform',
                  open && 'rotate-180',
                )}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-60 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
              >
                {/* Identity header */}
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {user.full_name}
                  </p>
                  <p className="mb-2 truncate text-xs text-slate-400">{user.email}</p>
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      ROLE_BADGE[user.role],
                    )}
                  >
                    {roleLabel(user.role)}
                  </span>
                </div>

                {/* Actions */}
                <div className="py-1">
                  <Link
                    to="/profile"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    <UserCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    Profile
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export default Topbar;
