"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DeskSection } from "@/features/hrms/components/hrms-page-helpers";

/**
 * Reads one-shot ?section= / ?leave=1 / ?new=1 URL params into desk section
 * state, then clears them from the address bar.
 */
export function useHrmsSectionFromUrl(canOwnLeave: boolean) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<DeskSection>("today");
  const [applyOpen, setApplyOpen] = useState(false);

  useEffect(() => {
    const sectionParam = searchParams.get("section");
    if (
      sectionParam === "leave" ||
      sectionParam === "history" ||
      sectionParam === "today"
    ) {
      queueMicrotask(() => {
        setSection(sectionParam);
        const next = new URLSearchParams(searchParams.toString());
        next.delete("section");
        const qs = next.toString();
        router.replace(qs ? `/hrms?${qs}` : "/hrms", { scroll: false });
      });
    }

    const wantLeave =
      searchParams.get("leave") === "1" || searchParams.get("new") === "1";
    if (!wantLeave || !canOwnLeave) return;
    queueMicrotask(() => {
      setSection("leave");
      setApplyOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("leave");
      next.delete("new");
      next.delete("section");
      const qs = next.toString();
      router.replace(qs ? `/hrms?${qs}` : "/hrms", { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { section, setSection, applyOpen, setApplyOpen };
}
