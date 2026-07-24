"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { cn } from "@/lib/utils/cn";
import type { NotificationPayload } from "@/lib/notifications/sse-hub";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function urgencyTone(
  type: string
): "danger" | "warning" | "info" | null {
  if (type === "batta_due" || type === "filing_defect") return "danger";
  if (type === "hearing_tomorrow" || type === "task_assigned") return "warning";
  if (type === "leave_request") return "info";
  return null;
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationPayload;
  onOpen: (item: NotificationPayload) => void;
}) {
  const unread = !item.readAt;
  const urgency = urgencyTone(item.type);
  return (
    <DropdownMenuItem
      className={cn(
        "flex cursor-pointer flex-col items-start gap-0.5 rounded-md px-2.5 py-2",
        unread && "bg-muted/60",
        urgency === "danger" && unread && "border-l-2 border-l-destructive",
        urgency === "warning" && unread && "border-l-2 border-l-amber-500",
        urgency === "info" && unread && "border-l-2 border-l-sky-500"
      )}
      onSelect={(e) => {
        e.preventDefault();
        onOpen(item);
      }}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className={cn(
            "line-clamp-2 text-sm leading-snug",
            unread ? "font-medium text-foreground" : "text-foreground/90"
          )}
        >
          {item.title}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {urgency && unread ? (
            <Badge
              variant={
                urgency === "danger"
                  ? "destructive"
                  : urgency === "warning"
                    ? "warning"
                    : "default"
              }
              className="h-5 px-1.5 text-[10px] capitalize"
            >
              {item.type.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {unread ? (
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />
          ) : null}
        </div>
      </div>
      {item.body ? (
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {item.body}
        </span>
      ) : null}
      <span className="text-[11px] text-muted-foreground/80">
        {formatWhen(item.createdAt)}
      </span>
    </DropdownMenuItem>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const { items, unread, loading, markRead, markAllRead } = useNotifications();

  async function openItem(item: NotificationPayload) {
    if (!item.readAt) await markRead(item.unitId);
    if (item.href) router.push(item.href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative shrink-0 text-navy hover:bg-muted hover:text-navy"
          aria-label={
            unread > 0
              ? `Notifications, ${unread} unread`
              : "Notifications"
          }
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <DropdownMenuLabel className="p-0 text-sm font-semibold normal-case">
            Notifications
          </DropdownMenuLabel>
          {unread > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => void markAllRead()}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-80 overflow-y-auto p-1">
          {loading && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </p>
          ) : (
            items.map((item) => (
              <NotificationRow
                key={item.unitId}
                item={item}
                onOpen={openItem}
              />
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
