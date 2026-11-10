/**
 * Shared Axios instance for the Internal Ticketing & Support frontend.
 *
 * Behaviour (CONTRACT §9):
 *   - `baseURL` comes from `import.meta.env.VITE_API_URL` (already includes the
 *     `/api` prefix, e.g. `http://localhost:8000/api`). All `@/api/*` modules use
 *     paths relative to it (e.g. `/auth/login`, `/tickets`).
 *   - A request interceptor attaches `Authorization: Bearer <token>` when a token
 *     is present in `localStorage` under the key `tms_token`.
 *   - A response interceptor clears the stored token and redirects to `/login`
 *     on any `401 Unauthorized`, so an expired/invalid session bounces the user
 *     back to sign-in instead of leaving the app in a broken authed state.
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

/** localStorage key under which the JWT access token is stored (CONTRACT §9). */
export const TOKEN_STORAGE_KEY = 'tms_token';

/**
 * Resolve the API base URL from Vite env. Falls back to the documented default
 * (`http://localhost:8000/api`) so a missing `.env` during local dev still works.
 */
const baseURL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';

/** Read the persisted access token (or `null` if not signed in). */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // localStorage can throw in private-mode / SSR-like contexts; treat as anon.
    return null;
  }
}

/** Persist the access token for subsequent authenticated requests. */
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Non-fatal: requests this session still carry the in-memory header if set.
  }
}

/** Remove the persisted access token (used on logout and 401 handling). */
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // No-op: nothing else to do if storage is unavailable.
  }
}

/** Configured Axios instance shared by every typed API module. */
const client: AxiosInstance = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: inject the bearer token when present. Axios v1 types the
 * config headers as `AxiosHeaders`, which exposes `.set(...)`.
 */
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/**
 * Response interceptor: on `401`, clear the session and redirect to `/login`.
 *
 * We avoid redirecting if we are already on the login page to prevent a reload
 * loop, and we always re-reject so callers can still surface an error message.
 */
client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearToken();
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== '/login'
      ) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

export default client;
