"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#f7f6f2",
          color: "#1b2a4a",
        }}
      >
        <main
          style={{
            maxWidth: 480,
            margin: "0 auto",
            padding: "64px 16px",
          }}
        >
          <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#5c6570", marginTop: 12 }}>
            The portal hit an unexpected error. Try again, or sign in again if
            the problem continues.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#8a93a0", marginTop: 8 }}>
              Ref {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "8px 14px",
              border: "1px solid #1b2a4a",
              background: "#1b2a4a",
              color: "#fff",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
