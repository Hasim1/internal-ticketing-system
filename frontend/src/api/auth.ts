/**
 * Authentication API (CONTRACT §5 — `app/routers/auth.py`, prefix `/api/auth`).
 *
 * The axios `baseURL` already includes `/api`, so paths here are relative to it
 * (`/auth/login`, `/auth/register`, `/auth/me`).
 */

import client from '@/api/client';
import type { User } from '@/types/models';

/** Request body for `POST /auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Successful login response: JWT plus the authenticated user (`TokenResponse`). */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

/** Request body for `POST /auth/register` (self-registration; always `employee`). */
export interface RegisterRequest {
  full_name: string;
  email: string;
  password: string;
  department_id?: number | null;
}

/**
 * Authenticate with email + password.
 *
 * @returns The access token and the current user. Callers persist the token via
 *   `@/api/client`'s `setToken` (typically through `AuthContext.login`).
 */
export async function login(email: string, password: string): Promise<TokenResponse> {
  const body: LoginRequest = { email, password };
  const { data } = await client.post<TokenResponse>('/auth/login', body);
  return data;
}

/**
 * Register a new account. The backend forces the `employee` role regardless of
 * input and returns the created user.
 */
export async function register(payload: RegisterRequest): Promise<User> {
  const { data } = await client.post<User>('/auth/register', payload);
  return data;
}

/** Fetch the currently authenticated user (`GET /auth/me`). Requires a token. */
export async function me(): Promise<User> {
  const { data } = await client.get<User>('/auth/me');
  return data;
}
