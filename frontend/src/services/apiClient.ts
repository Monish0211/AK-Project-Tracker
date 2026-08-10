const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Fired once per 401 response, from any request. Kept as a plain callback
 * (not a React import) so this file has zero UI dependencies — authContext
 * is the one that registers a handler, so a 401 anywhere clears the session
 * and redirects to /login without this module needing to know React exists.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (!response.ok || !body?.success) {
    throw new ApiError(response.status, body?.message ?? "Something went wrong. Please try again.");
  }

  return body.data;
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
};
