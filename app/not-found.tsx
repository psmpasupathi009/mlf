import Link from "next/link";
import { brand } from "@/config/company/brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/shared/components/theme/theme-toggle";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border/80 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-navy">
          {brand.name}
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          404
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-navy">
          Page not found
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This link does not match a page in the {brand.shortName} portal.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
