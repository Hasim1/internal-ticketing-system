/**
 * Authentication context (CONTRACT §9).
 *
 * Holds the authenticated `user` and JWT `token`, persists the token in
 * `localStorage` under `tms_token` (via `@/api/client`'s token helpers), and
 * exposes `login`, `register`, `logout`, and `refresh`.
 *
 * On mount, if a token is already present, it calls `GET /auth/me` to hydrate
 * the user so a page refresh keeps the session. The `loading` flag is `true`
 * until that hydration attempt settles — route guards wait on it before
 * deciding to redirect.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import * as authApi from '@/api/auth';
import { clearToken, getToken, setToken } from '@/api/client';
import type { RegisterRequest } from '@/api/auth';
import type { User } from '@/types/models';
import type { UserRole } from '@/types/enums';

/** Shape of the value provided by {@link AuthContext}. */
export interface AuthContextValue {
  /** The authenticated user, or `null` when signed out / not yet hydrated. */
  user: User | null;
  /** The current JWT access token, or `null` when signed out. */
  token: string | null;
  /** `true` while the initial session hydration is in flight. */
  loading: boolean;
  /** Whether a user is currently authenticated. */
  isAuthenticated: boolean;
  /**
   * Authenticate with email + password. Persists the token, sets the user, and
   * returns the user on success. Rejects (re-throws) on bad credentials so the
   * caller can surface an error.
   */
  login: (email: string, password: string) => Promise<User>;
  /**
   * Self-register a new (always `employee`) account. Returns the created user.
   * Does NOT sign the user in — the caller typically redirects to `/login`.
   */
  register: (payload: RegisterRequest) => Promise<User>;
  /** Clear the token and user, signing the session out. */
  logout: () => void;
  /** Re-fetch the current user from `GET /auth/me` (e.g. after a profile edit). */
  refresh: () => Promise<void>;
  /** True if the current user's role is one of the supplied `roles`. */
  hasRole: (...roles: UserRole[]) => boolean;
}

/**
 * The context object. Default is `null` so {@link useAuth} can detect (and
 * loudly fail) when a consumer is rendered outside the provider.
 */
const AuthContext = createContext<AuthContextValue | null>(null);
AuthContext.displayName = 'AuthContext';

/** Props for {@link AuthProvider}. */
export interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Provider that owns auth state for the app. Mount it near the root, above the
 * router, so every route can read the session via {@link useAuth}.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(() => getToken());
  // Start in a loading state only if we have a token to validate on mount.
  const [loading, setLoading] = useState<boolean>(() => Boolean(getToken()));

  /** Persist token to storage + state, or clear both when given `null`. */
  const persistToken = useCallback((next: string | null) => {
    if (next) {
      setToken(next);
    } else {
      clearToken();
    }
    setTokenState(next);
  }, []);

  /** Clear all session state (in-memory + storage). */
  const logout = useCallback(() => {
    persistToken(null);
    setUser(null);
  }, [persistToken]);

  /**
   * Hydrate / refresh the current user from the API. On a 401 (expired or
   * invalid token) the session is cleared. The axios client also redirects to
   * `/login` on 401, but clearing here keeps in-memory state consistent.
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      // Invalid/expired session: drop it so guards redirect to /login.
      logout();
    }
  }, [logout]);

  // On mount, attempt to hydrate the session from a persisted token.
  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (!cancelled) {
          setUser(me);
        }
      } catch {
        if (!cancelled) {
          persistToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [persistToken]);

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const res = await authApi.login(email, password);
      persistToken(res.access_token);
      setUser(res.user);
      return res.user;
    },
    [persistToken],
  );

  const register = useCallback(
    async (payload: RegisterRequest): Promise<User> => {
      // Registration does not return a token; user must log in afterwards.
      return authApi.register(payload);
    },
    [],
  );

  const hasRole = useCallback(
    (...roles: UserRole[]): boolean => {
      if (!user) {
        return false;
      }
      return roles.includes(user.role);
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      login,
      register,
      logout,
      refresh,
      hasRole,
    }),
    [user, token, loading, login, register, logout, refresh, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Access the auth context. Throws if used outside an {@link AuthProvider} so
 * the misconfiguration surfaces immediately during development.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}

export default AuthContext;
