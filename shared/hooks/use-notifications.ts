"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import type { NotificationPayload } from "@/lib/notifications/sse-hub";

type ListEnvelope = {
  data?: NotificationPayload[];
  meta?: { total?: number };
};

type UnreadEnvelope = { unread?: number };

const POLL_MS = 20_000;
const LIST_LIMIT = 20;

export function useNotifications() {
  const [items, setItems] = useState<NotificationPayload[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const seenLive = useRef(new Set<string>());

  const refetch = useCallback(async () => {
    const [listRes, countRes] = await Promise.all([
      apiFetch<ListEnvelope>(
        `/api/v1/notifications?page=1&pageSize=${LIST_LIMIT}`
      ),
      apiFetch<UnreadEnvelope>("/api/v1/notifications/unread-count"),
    ]);

    if (listRes.ok && listRes.data && typeof listRes.data === "object") {
      const rows = Array.isArray(listRes.data.data) ? listRes.data.data : [];
      setItems(rows);
    }

    if (countRes.ok && typeof countRes.data?.unread === "number") {
      setUnread(countRes.data.unread);
    }
    setLoading(false);
  }, []);

  const markRead = useCallback(async (unitId: string) => {
    const { ok } = await apiFetch(`/api/v1/notifications/${unitId}/read`, {
      method: "PATCH",
    });
    if (!ok) return false;
    setItems((prev) =>
      prev.map((n) =>
        n.unitId === unitId && !n.readAt
          ? { ...n, readAt: new Date().toISOString() }
          : n
      )
    );
    setUnread((n) => Math.max(0, n - 1));
    return true;
  }, []);

  const markAllRead = useCallback(async () => {
    const { ok } = await apiFetch("/api/v1/notifications/read-all", {
      method: "POST",
    });
    if (!ok) return false;
    setItems((prev) =>
      prev.map((n) =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() }
      )
    );
    setUnread(0);
    return true;
  }, []);

  const prependLive = useCallback((payload: NotificationPayload) => {
    if (seenLive.current.has(payload.unitId)) return;
    seenLive.current.add(payload.unitId);
    setItems((prev) => {
      if (prev.some((n) => n.unitId === payload.unitId)) return prev;
      return [payload, ...prev].slice(0, LIST_LIMIT);
    });
    if (!payload.readAt) {
      setUnread((n) => n + 1);
      toast.message(payload.title);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Polling fallback + visibility refetch
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, POLL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refetch]);

  // SSE live stream
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/v1/notifications/stream", {
        withCredentials: true,
      });

      es.addEventListener("notification", (ev) => {
        try {
          const payload = JSON.parse(
            (ev as MessageEvent).data
          ) as NotificationPayload;
          prependLive(payload);
        } catch {
          /* ignore malformed */
        }
      });

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          retryTimer = setTimeout(connect, 5000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [prependLive]);

  return {
    items,
    unread,
    loading,
    refetch,
    markRead,
    markAllRead,
  };
}
