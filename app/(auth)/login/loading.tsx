export default function LoginLoading() {
  return (
    <main className="grid min-h-dvh grid-cols-2">
      <div className="min-h-dvh animate-pulse bg-navy" />
      <div className="flex min-h-dvh items-center justify-center bg-white p-6">
        <div className="h-48 w-full max-w-[21.5rem] animate-pulse rounded-lg bg-muted" />
      </div>
    </main>
  );
}
