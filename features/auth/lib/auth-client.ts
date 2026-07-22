async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
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

    const data = (await parseJson(res)) as T;
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: {
        error: aborted
          ? "Request timed out. Please try again."
          : "Network error. Please try again.",
      } as T,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function getErrorMessage(
  data: { error?: string; message?: string },
  fallback: string
): string {
  return data.error || data.message || fallback;
}
