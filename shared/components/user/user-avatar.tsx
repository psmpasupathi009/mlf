"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";

type UserAvatarProps = {
  name?: string | null;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-24 text-2xl",
} as const;

function initials(name?: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function UserAvatar({
  name,
  photoUrl,
  size = "md",
  className,
}: UserAvatarProps) {
  const label = useMemo(() => initials(name), [name]);

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy/10 font-semibold text-navy ring-1 ring-border",
        SIZES[size],
        className
      )}
      aria-hidden={!name}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="size-full object-cover"
        />
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}
