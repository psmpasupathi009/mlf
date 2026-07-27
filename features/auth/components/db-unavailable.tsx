"use client";

/**
 * Shown when Mongo/Atlas is unreachable. Must not clear auth cookies —
 * a transient outage is not a logout.
 */
export function DbUnavailable({
  title = "Database temporarily unavailable",
  detail = "Your session was kept. Check Atlas Network Access (0.0.0.0/0 for Vercel), then retry.",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
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
