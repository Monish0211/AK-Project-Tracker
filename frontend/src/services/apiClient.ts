import { isCountryContextRejection } from "../auth/countryContextLogic";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

// P1 reliability fix — every call was previously an unbounded fetch() with no
// timeout, so a connection that never responds left the caller's promise
// pending forever (see Dashboard.tsx's isLoading, only ever cleared in a
// .finally() that a never-settling promise never reaches). 30s covers this
// app's normal CRUD/list/aggregation calls (including GET /dashboard/summary)
// with headroom for realistic network jitter; call sites for the small set of
// genuinely heavy operations (PDF AI extraction, bulk timesheet delete, bulk
// project/customer/employee import) pass an explicit longer override via
// ApiRequestOptions instead of raising this shared default.
const DEFAULT_TIMEOUT_MS = 30_000;

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  /** Structured detail the server attaches to some errors (e.g. per-row import problems). */
  details?: unknown;
}

export interface ApiRequestOptions {
  /** Overrides DEFAULT_TIMEOUT_MS for this one call. Only known heavy operations should set this. */
  timeoutMs?: number;
}

export class ApiError extends Error {
  status: number;
  /**
   * True only when this request was aborted by our own timeout timer — no
   * HTTP response was ever received, so `status` here is 0, not a real
   * server-issued code. Never set for an ordinary 4xx/5xx (those keep their
   * real HTTP status). Callers use this to show timeout-specific copy (see
   * apiClient.ts's own request()/requestFormData() for where it's thrown) —
   * in particular, a timed-out mutation must never be reported as a
   * confirmed failure, since the server may have completed it anyway.
   */
  isTimeout?: boolean;
  /** Structured, client-safe detail the server attached to the error (e.g. the per-row problems of a rejected import). */
  details?: unknown;

  constructor(status: number, message: string, isTimeout?: boolean, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (isTimeout) this.isTimeout = true;
    if (details !== undefined) this.details = details;
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Active country (Global Multi-Country Phase 1) — sent as X-Active-Country on every request while set. It only narrows what
 * lists return; the backend re-validates it against the account's grants on every request and never trusts it for a write.
 * null (the default, and always while the feature is off) sends no header, so behaviour is exactly as before.
 */
let activeCountry: string | null = null;

export function setActiveCountry(value: string | null): void {
  activeCountry = value;
}

/** Fired when the server refuses the active country (e.g. a grant was removed), so the country context can recover. */
let onCountryContextRejected: (() => void) | null = null;

export function setCountryContextRejectedHandler(handler: (() => void) | null): void {
  onCountryContextRejected = handler;
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

async function request<T>(path: string, options: RequestInit = {}, requestOptions: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (activeCountry) {
    headers["X-Active-Country"] = activeCountry;
  }

  // One fresh AbortController per call — never shared/global, so one
  // request's timeout can never abort a different, concurrent request (e.g.
  // ViewProject's Promise.allSettled or Timesheets' multi-delete Promise.all
  // each get their own independent controller and timer). Kept alive for the
  // FULL request lifecycle — through response.json(), not just fetch()
  // itself — so a connection that delivers headers promptly but then stalls
  // mid-body is still bounded by this same timer, not just time-to-first-byte.
  // clearTimeout() below runs exactly once, in the one finally that wraps
  // both awaits, whichever path (success, HTTP error, timeout, or network
  // failure) the request settles through.
  const controller = new AbortController();
  const timeoutMs = requestOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  let body: ApiEnvelope<T> | null;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, signal: controller.signal });
    try {
      body = (await response.json()) as ApiEnvelope<T>;
    } catch (parseErr) {
      // A genuinely malformed/empty body is not a timeout — preserve the
      // previous "treat as null" behavior so response.ok/status still drives
      // an ordinary ApiError below. Only an abort raised by OUR timer while
      // still reading the body gets reclassified as a timeout, so it's
      // rethrown to the outer catch instead of being swallowed here.
      if (parseErr instanceof DOMException && parseErr.name === "AbortError") {
        throw parseErr;
      }
      body = null;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request timed out. Please try again.", true);
    }
    throw new ApiError(0, "Network error. Please check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (isCountryContextRejection(response.status, body?.message ?? "")) {
    onCountryContextRejected?.();
  }

  if (!response.ok || !body?.success) {
    throw new ApiError(response.status, body?.message ?? "Something went wrong. Please try again.", false, body?.details);
  }

  return body.data;
}

/**
 * Multipart upload — deliberately NOT built on request()'s shared path,
 * because that function always hardcodes Content-Type: application/json.
 * For a FormData body the browser must set its own multipart boundary in
 * Content-Type itself; explicitly setting it here (even to the "right"
 * value) breaks the boundary and the backend fails to parse the upload.
 * This is the one deliberate deviation from request()'s behavior — first
 * file-upload call this frontend makes to the backend (confirmed: no prior
 * multipart usage exists anywhere in frontend/src).
 */
async function requestFormData<T>(path: string, formData: FormData, requestOptions: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (activeCountry) {
    headers["X-Active-Country"] = activeCountry;
  }

  // Deliberately not routed through request() — see this file's own header
  // comment on requestFormData for why (multipart Content-Type). Timeout
  // handling is therefore duplicated here rather than shared, matching the
  // rest of this function's existing behavior. Same full-lifecycle coverage
  // as request() — see that function's own comment on why the timer stays
  // alive through response.json(), not just fetch() itself.
  const controller = new AbortController();
  const timeoutMs = requestOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  let body: ApiEnvelope<T> | null;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", body: formData, headers, signal: controller.signal });
    try {
      body = (await response.json()) as ApiEnvelope<T>;
    } catch (parseErr) {
      if (parseErr instanceof DOMException && parseErr.name === "AbortError") {
        throw parseErr;
      }
      body = null;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request timed out. Please try again.", true);
    }
    throw new ApiError(0, "Network error. Please check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (isCountryContextRejection(response.status, body?.message ?? "")) {
    onCountryContextRejected?.();
  }

  if (!response.ok || !body?.success) {
    throw new ApiError(response.status, body?.message ?? "Something went wrong. Please try again.", false, body?.details);
  }

  return body.data;
}

/**
 * Authenticated binary download — Documents' download endpoint requires the
 * same Bearer token every other call uses, so a plain `<a href>`/
 * `window.open()` (which sends no Authorization header) can't be used. No
 * existing helper does this (confirmed: this is the first authenticated
 * binary download this frontend makes), so this is a small, additive sibling
 * to requestFormData() above — same accessToken/timeout/abort/401 handling,
 * `response.blob()` instead of JSON.
 */
async function requestBlob(path: string, requestOptions: ApiRequestOptions = {}): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (activeCountry) {
    headers["X-Active-Country"] = activeCountry;
  }

  const controller = new AbortController();
  const timeoutMs = requestOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request timed out. Please try again.", true);
    }
    throw new ApiError(0, "Network error. Please check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (!response.ok) {
    // Error responses here are JSON (the normal ApiEnvelope shape), not the
    // binary payload success returns.
    let message = "Something went wrong. Please try again.";
    try {
      const body = (await response.json()) as ApiEnvelope<never>;
      message = body?.message ?? message;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(response.status, message);
  }

  return response.blob();
}

/** Upload progress of one multipart request: bytes of the request body sent so far, out of `total`. */
export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0-100, rounded down; 100 only once the whole body has been handed to the network. */
  percent: number;
}

/**
 * Multipart upload WITH progress (Document upload, Nov 2026). fetch() cannot report request-body progress, so this one helper uses
 * XMLHttpRequest. Everything else mirrors requestFormData() exactly: the same Bearer token and X-Active-Country headers, the
 * browser's own multipart Content-Type, the same 401 / country-rejection callbacks, the same ApiEnvelope error message. Two
 * additions: a progress callback, and a readable message when a proxy refuses the body with a non-JSON 413.
 */
function requestFormDataWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (progress: UploadProgress) => void,
  requestOptions: ApiRequestOptions = {}
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}${path}`);
    if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    if (activeCountry) xhr.setRequestHeader("X-Active-Country", activeCountry);
    xhr.timeout = requestOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress({ loaded: event.loaded, total: event.total, percent: Math.min(100, Math.floor((event.loaded / event.total) * 100)) });
      };
    }
    xhr.ontimeout = () => reject(new ApiError(0, "Upload timed out. Please try again.", true));
    xhr.onerror = () => reject(new ApiError(0, "Network error. Please check your connection and try again."));
    xhr.onabort = () => reject(new ApiError(0, "Upload cancelled."));
    xhr.onload = () => {
      let body: ApiEnvelope<T> | null;
      try {
        body = JSON.parse(xhr.responseText) as ApiEnvelope<T>;
      } catch {
        body = null; // e.g. a proxy's HTML 413 page
      }
      if (xhr.status === 401) onUnauthorized?.();
      if (isCountryContextRejection(xhr.status, body?.message ?? "")) onCountryContextRejected?.();
      if (xhr.status < 200 || xhr.status >= 300 || !body?.success) {
        const fallback = xhr.status === 413 ? "The file is larger than the server accepts." : "Something went wrong. Please try again.";
        reject(new ApiError(xhr.status, body?.message ?? fallback, false, body?.details));
        return;
      }
      resolve(body.data);
    };
    xhr.send(formData);
  });
}

export const apiClient = {
  // `options` is optional on every method — every existing call site (none
  // of which pass it) is unaffected and automatically gets DEFAULT_TIMEOUT_MS.
  get: <T>(path: string, options?: ApiRequestOptions): Promise<T> => request<T>(path, { method: "GET" }, options),
  post: <T>(path: string, data?: unknown, options?: ApiRequestOptions): Promise<T> =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }, options),
  patch: <T>(path: string, data?: unknown, options?: ApiRequestOptions): Promise<T> =>
    request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }, options),
  // Full-replacement updates (e.g. Settings → Weekly Emails recipients, Oct 2026).
  put: <T>(path: string, data?: unknown, options?: ApiRequestOptions): Promise<T> =>
    request<T>(path, { method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined }, options),
  // `data` is optional — every existing caller passes none and is unaffected.
  // Added for Permanent Delete's Invoice Protection flag (see
  // projectService.ts's permanentlyDeleteProjectViaApi()), the first DELETE
  // call in this app that needs to carry a body.
  delete: <T>(path: string, data?: unknown, options?: ApiRequestOptions): Promise<T> =>
    request<T>(path, { method: "DELETE", body: data !== undefined ? JSON.stringify(data) : undefined }, options),
  postFormData: <T>(path: string, formData: FormData, options?: ApiRequestOptions): Promise<T> =>
    requestFormData<T>(path, formData, options),
  postFormDataWithProgress: <T>(path: string, formData: FormData, onProgress?: (progress: UploadProgress) => void, options?: ApiRequestOptions): Promise<T> =>
    requestFormDataWithProgress<T>(path, formData, onProgress, options),
  getBlob: (path: string, options?: ApiRequestOptions): Promise<Blob> => requestBlob(path, options),
};
