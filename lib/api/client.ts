type ApiEnvelope = {
  ok?: boolean;
  data?: unknown;
  meta?: unknown;
  error?: { code?: string; message?: string } | string;
  message?: string;
  code?: string;
  [key: string]: unknown;
};

async function parseJson(res: Response): Promise<ApiEnvelope> {
  try {
    return (await res.json()) as ApiEnvelope;
  } catch {
    return {};
  }
}

/** Unwrap `{ ok, data }` or legacy flat payloads. */
export function unwrapData<T>(body: ApiEnvelope): T {
  if (body && typeof body === "object" && body.ok === true && body.data != null) {
    return body.data as T;
  }
  return body as T;
}

/**
 * Success payloads: unwrap `data` for single resources; for list envelopes
 * keep `data` + `meta` and any extras (e.g. accounts `summary`).
 */
function unwrapSuccess<T>(raw: ApiEnvelope): T {
  if (raw.meta != null) {
    // Strip envelope keys; keep data/meta and extras (e.g. summary).
    const rest = { ...raw };
    delete rest.ok;
    delete rest.error;
    delete rest.message;
    delete rest.code;
    return rest as T;
  }
  return raw.data as T;
}

export function getErrorMessage(data: unknown, fallback: string): string {
  const body = data as ApiEnvelope;
  if (body?.error && typeof body.error === "object" && body.error.message) {
    return body.error.message;
  }
  if (typeof body?.error === "string") return body.error;
  if (typeof body?.message === "string") return body.message;
  return fallback;
}

export function getErrorCode(data: unknown): string | undefined {
  const body = data as ApiEnvelope;
  if (body?.error && typeof body.error === "object" && body.error.code) {
    return body.error.code;
  }
  if (typeof body?.code === "string") return body.code;
  return undefined;
}

/** Lightweight JSON POST with credentials (web cookies) + timeout. */
export async function authFetch<T = Record<string, unknown>>(
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 15000
): Promise<{ ok: boolean; status: number; data: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    const raw = await parseJson(res);
    const data =
      res.ok && raw.ok === true && raw.data != null
        ? unwrapSuccess<T>(raw)
        : ((raw.ok === false ? raw : unwrapData<T>(raw)) as T);

    return { ok: res.ok && raw.ok !== false, status: res.status, data };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: {
        error: aborted
          ? "Server took too long (often MongoDB Atlas unreachable — check Network Access IP allowlist)."
          : "Network error. Please try again.",
      } as T,
    };
  } finally {
    clearTimeout(timer);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * Portal fetch with one silent refresh retry on 401.
 * Prefer this over raw fetch for authenticated API calls.
 */
export async function apiFetch<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit & { json?: Record<string, unknown> },
  timeoutMs = 15000
): Promise<{ ok: boolean; status: number; data: T }> {
  const run = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init?.headers);
      if (init?.json) {
        headers.set("Content-Type", "application/json");
      }
      return await fetch(path, {
        ...init,
        headers,
        body: init?.json ? JSON.stringify(init.json) : init?.body,
        credentials: "include",
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await run();
    if (res.status === 401 && !path.includes("/auth/refresh")) {
      const refreshed = await silentRefresh();
      if (refreshed) res = await run();
    }

    const raw = await parseJson(res);
    const data =
      res.ok && raw.ok === true && raw.data != null
        ? unwrapSuccess<T>(raw)
        : ((raw.ok === false ? raw : unwrapData<T>(raw)) as T);

    return { ok: res.ok && raw.ok !== false, status: res.status, data };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: {
        error: aborted
          ? "Server took too long (often MongoDB Atlas unreachable — check Network Access IP allowlist)."
          : "Network error. Please try again.",
      } as T,
    };
  }
}

/** Authenticated file download with one silent refresh retry on 401. */
export async function apiDownload(
  path: string,
  filename: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    let res = await fetch(path, { credentials: "include", cache: "no-store" });
    if (res.status === 401) {
      const refreshed = await silentRefresh();
      if (refreshed) {
        res = await fetch(path, { credentials: "include", cache: "no-store" });
      }
    }
    if (!res.ok) {
      const raw = await parseJson(res);
      return {
        ok: false,
        error: getErrorMessage(raw, "Download failed"),
      };
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}
