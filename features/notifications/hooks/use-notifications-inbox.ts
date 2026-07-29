"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { NotificationPayload } from "@/lib/notifications/sse-hub";
import {
  categoryForType,
  type NotificationCategory,
} from "@/features/notifications/lib/notification-meta";
import {
  emitNotificationsChanged,
  onNotificationsChanged,
} from "@/features/notifications/lib/notifications-sync";

export type InboxFilter = "all" | "unread" | NotificationCategory;

type ListEnvelope = {
  data?: NotificationPayload[];
  meta?: { page?: number; pageSize?: number; total?: number };
};

type UnreadEnvelope = { unread?: number };

const PAGE_SIZE = 20;

function buildListUrl(page: number, filter: InboxFilter): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  if (filter === "unread") {
    params.set("unread", "1");
  } else if (filter !== "all") {
    params.set("category", filter);
  }
  return `/api/notifications?${params.toString()}`;
}

export function useNotificationsInbox(filter: InboxFilter, page: number) {
  const [items, setItems] = useState<NotificationPayload[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const seenLive = useRef(new Set<string>());
  const knownIds = useRef(new Set<string>());
  const marking = useRef(new Set<string>());
  const filterRef = useRef(filter);
  const pageRef = useRef(page);
  const skipNextSync = useRef(false);

  useEffect(() => {
    filterRef.current = filter;
    pageRef.current = page;
  }, [filter, page]);

  const refreshUnread = useCallback(async () => {
    const countRes = await apiFetch<UnreadEnvelope>(
      "/api/notifications/unread-count"
    );
    if (countRes.ok && typeof countRes.data?.unread === "number") {
      setUnread(countRes.data.unread);
    }
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    const [listRes, countRes] = await Promise.all([
      apiFetch<ListEnvelope>(buildListUrl(pageRef.current, filterRef.current)),
      apiFetch<UnreadEnvelope>("/api/notifications/unread-count"),
    ]);

    if (listRes.ok && listRes.data && typeof listRes.data === "object") {
      const rows = Array.isArray(listRes.data.data) ? listRes.data.data : [];
      knownIds.current = new Set(rows.map((r) => r.unitId));
      setItems(rows);
      setTotal(
        typeof listRes.data.meta?.total === "number" ? listRes.data.meta.total : 0
      );
    }

    if (countRes.ok && typeof countRes.data?.unread === "number") {
      setUnread(countRes.data.unread);
    }
    setLoading(false);
  }, []);

  const markRead = useCallback(
    async (unitId: string) => {
      if (marking.current.has(unitId)) return true;
      marking.current.add(unitId);
      try {
        const { ok } = await apiFetch(`/api/notifications/${unitId}/read`, {
          method: "PATCH",
        });
        if (!ok) return false;

        setItems((prev) => {
          const target = prev.find((n) => n.unitId === unitId);
          if (!target || target.readAt) return prev;
          const next = prev.map((n) =>
            n.unitId === unitId
              ? { ...n, readAt: new Date().toISOString() }
              : n
          );
          if (filterRef.current === "unread") {
            return next.filter((n) => !n.readAt);
          }
          return next;
        });
        if (filterRef.current === "unread") {
          setTotal((t) => Math.max(0, t - 1));
        }
        void refreshUnread();

        skipNextSync.current = true;
        emitNotificationsChanged();
        return true;
      } finally {
        marking.current.delete(unitId);
      }
    },
    [refreshUnread]
  );

  const markAllRead = useCallback(async () => {
    const { ok } = await apiFetch("/api/notifications/read-all", {
      method: "POST",
    });
    if (!ok) return false;
    if (filterRef.current === "unread") {
      setItems([]);
      setTotal(0);
    } else {
      setItems((prev) =>
        prev.map((n) =>
          n.readAt ? n : { ...n, readAt: new Date().toISOString() }
        )
      );
    }
    setUnread(0);
    skipNextSync.current = true;
    emitNotificationsChanged();
    return true;
  }, []);

  const prependLive = useCallback(
    (payload: NotificationPayload) => {
      if (seenLive.current.has(payload.unitId)) return;
      seenLive.current.add(payload.unitId);

      const f = filterRef.current;
      const matchesFilter =
        f === "all" ||
        (f === "unread" ? !payload.readAt : categoryForType(payload.type) === f);

      if (
        pageRef.current === 1 &&
        matchesFilter &&
        !knownIds.current.has(payload.unitId)
      ) {
        knownIds.current.add(payload.unitId);
        setItems((prev) => [payload, ...prev].slice(0, PAGE_SIZE));
        setTotal((t) => t + 1);
      }

      // Server count avoids SSE-vs-refetch double increments
      void refreshUnread();
    },
    [refreshUnread]
  );

  useEffect(() => {
    void refetch();
  }, [refetch, filter, page]);

  useEffect(() => {
    return onNotificationsChanged(() => {
      if (skipNextSync.current) {
        skipNextSync.current = false;
        return;
      }
      void refetch();
    });
  }, [refetch]);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/notifications/stream", {
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
    total,
    unread,
    loading,
    pageSize: PAGE_SIZE,
    refetch,
    markRead,
    markAllRead,
  };
}
