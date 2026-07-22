export default function PortalLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse space-y-6 px-4 py-8 sm:px-6">
      <div className="h-4 w-24 rounded bg-border" />
      <div className="h-9 w-64 max-w-full rounded bg-border" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-28 rounded-xl bg-border" />
        <div className="h-28 rounded-xl bg-border" />
        <div className="h-28 rounded-xl bg-border" />
      </div>
    </div>
  );
}
