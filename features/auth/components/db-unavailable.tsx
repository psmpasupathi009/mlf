"use client";

/**
 * Shown when Mongo/Atlas is unreachable. Must not clear auth cookies —
 * a transient outage is not a logout.
 */
export function DbUnavailable({
  title = "Database temporarily unavailable",
  detail = "Your session was kept. In Atlas → Network Access, allow 0.0.0.0/0 (Access from Anywhere) so changing home IPs do not block you again, then retry.",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center sm:p-8">
      <div className="max-w-md space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <button
        type="button"
        className="text-sm underline underline-offset-4 text-foreground"
        onClick={() => window.location.reload()}
      >
        Retry
      </button>
    </div>
  );
}
