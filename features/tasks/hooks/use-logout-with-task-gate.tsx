"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PendingTasksGateDialog,
  fetchPendingTaskResponses,
} from "@/features/tasks/components/finish-task-dialog";
import { performLogout } from "@/features/auth/lib/perform-logout";

/**
 * Logout that asks for evening task responses first when any are pending.
 */
export function useLogoutWithTaskGate() {
  const router = useRouter();
  const [gateOpen, setGateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const proceedRef = useRef<(() => void) | null>(null);

  const finishLogout = useCallback(async () => {
    setLoading(true);
    await performLogout(router);
    setLoading(false);
  }, [router]);

  const requestLogout = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const pending = await fetchPendingTaskResponses();
    if (!pending.ok) {
      toast.error(pending.error);
      setLoading(false);
      return;
    }
    if (pending.tasks.length > 0) {
      setLoading(false);
      proceedRef.current = () => {
        void finishLogout();
      };
      setGateOpen(true);
      return;
    }
    await finishLogout();
  }, [loading, finishLogout]);

  const onAllDone = useCallback(() => {
    const next = proceedRef.current;
    proceedRef.current = null;
    next?.();
  }, []);

  const handleGateOpenChange = useCallback((open: boolean) => {
    setGateOpen(open);
    if (!open) {
      proceedRef.current = null;
    }
  }, []);

  const gate = (
    <PendingTasksGateDialog
      open={gateOpen}
      onOpenChange={handleGateOpenChange}
      reason="logout"
      onAllDone={onAllDone}
    />
  );

  return { requestLogout, loading, gate };
}
