"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authFetch, getErrorMessage } from "@/lib/api/client";

/** Clears session cookies and navigates to login. Safe to call from menus/buttons. */
export async function performLogout(
  router: ReturnType<typeof useRouter>
): Promise<void> {
  const { ok, data } = await authFetch("/api/v1/auth/logout", {});
  if (!ok) {
    toast.error(getErrorMessage(data, "Logout failed"));
  } else {
    toast.success("Logged out");
  }
  router.replace("/login");
  router.refresh();
}
