"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";

/**
 * When access JWT expired but refresh cookie exists, refresh once then reload RSC.
 */
export function SessionRefreshGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { ok } = await apiFetch("/api/v1/auth/refresh", {
        method: "POST",
        json: {},
      });
      if (cancelled) return;
      if (!ok) {
        setFailed(true);
        router.replace("/login");
        return;
      }
      setReady(true);
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (failed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Session expired. Redirecting to sign in…
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Restoring session…
      </div>
    );
  }

  return <>{children}</>;
}
