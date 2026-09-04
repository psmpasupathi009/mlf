"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogoutWithTaskGate } from "@/features/tasks/hooks/use-logout-with-task-gate";

/** Standalone logout control — prefer UserMenu in the portal header. */
export function LogoutButton() {
  const { requestLogout, loading, gate } = useLogoutWithTaskGate();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void requestLogout()}
        disabled={loading}
        className="gap-2 text-muted-foreground hover:text-navy"
      >
        <LogOut className="size-4" />
        <span className="hidden sm:inline">
          {loading ? "Signing out…" : "Logout"}
        </span>
      </Button>
      {gate}
    </>
  );
}
