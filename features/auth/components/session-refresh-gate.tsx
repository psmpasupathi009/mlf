"use client";

import { useEffect, useState } from "react";
import { refreshSession } from "@/lib/api/client";
import { DbUnavailable } from "@/features/auth/components/db-unavailable";

type GateState = "loading" | "failed" | "unreachable";

/**
 * When access JWT expired but refresh cookie exists, refresh once then
 * hard-navigate so RSC picks up new cookies reliably.
 * DB / 5xx failures must NOT clear cookies (that caused connect/disconnect loops).
 */
export function SessionRefreshGate() {
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setState("unreachable");
    }, 15000);

    (async () => {
      const result = await refreshSession();
      if (cancelled) return;
      window.clearTimeout(timeout);

      if (result.ok) {
        window.location.assign("/");
        return;
      }

      if (result.reason === "unauthorized") {
        setState("failed");
        window.location.assign("/api/v1/auth/session-expired");
        return;
      }

      // unreachable | network | error — keep cookies, let user retry
      setState("unreachable");
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  if (state === "failed") {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground sm:p-8">
        Session expired. Redirecting to sign in…
      </div>
    );
  }

  if (state === "unreachable") {
    return (
      <DbUnavailable title="Could not restore session" />
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground sm:p-8">
      Restoring session…
    </div>
  );
}
