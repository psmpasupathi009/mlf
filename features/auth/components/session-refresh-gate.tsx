"use client";

import { useEffect, useState } from "react";
import { ensureSessionRefresh } from "@/lib/api/client";

/**
 * When access JWT expired but refresh cookie exists, refresh once then
 * hard-navigate so RSC picks up new cookies reliably.
 */
export function SessionRefreshGate() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setFailed(true);
        window.location.assign("/login");
      }
    }, 15000);

    (async () => {
      const ok = await ensureSessionRefresh();
      if (cancelled) return;
      window.clearTimeout(timeout);
      if (!ok) {
        setFailed(true);
        // Clear leftovers then login
        window.location.assign("/api/v1/auth/session-expired");
        return;
      }
      window.location.assign("/");
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  if (failed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Session expired. Redirecting to sign in…
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      Restoring session…
    </div>
  );
}
