export default function LoginLoading() {
  return (
    <main className="grid min-h-dvh grid-cols-1 bg-white md:grid-cols-2">
      <div className="min-h-16 animate-pulse bg-navy md:min-h-dvh" />
      <div className="flex min-h-dvh items-center justify-center bg-white p-6">
        <div className="h-48 w-full max-w-86 animate-pulse rounded-lg bg-muted" />
      </div>
    </main>
  );
}
