"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authFetch, getErrorMessage } from "@/lib/api/client";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    const { ok, data } = await authFetch("/api/v1/auth/logout", {});
    setLoading(false);

    if (!ok) {
      toast.error(getErrorMessage(data, "Logout failed"));
      // Still clear local session UX
    } else {
      toast.success("Logged out");
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={loading}
      className="gap-2 text-muted-foreground hover:text-navy"
    >
      <LogOut className="size-4" />
      <span className="hidden sm:inline">
        {loading ? "Signing out…" : "Logout"}
      </span>
    </Button>
  );
}
