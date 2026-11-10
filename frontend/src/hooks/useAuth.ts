/**
 * Convenience re-export of the auth hook.
 *
 * The authentication state and `useAuth` hook live in
 * `@/context/AuthContext`. This module simply re-exports them so consumers can
 * `import { useAuth } from '@/hooks/useAuth'` consistently alongside the other
 * hooks, without reaching into the context module directly.
 */

export { useAuth } from '@/context/AuthContext';
export type { AuthContextValue } from '@/context/AuthContext';
export { useAuth as default } from '@/context/AuthContext';
