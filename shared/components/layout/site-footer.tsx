import Link from "next/link";
import { brand } from "@/config/company/brand";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/80 bg-muted pb-[env(safe-area-inset-bottom)] print:bg-white">
      <div className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4 lg:px-6">
        <p className="text-xs text-muted-foreground">
          © {year} {brand.name}
        </p>
        <nav className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          <Link href="/legal/terms" className="rounded-md px-2 py-2 hover:bg-muted hover:text-navy">
            Terms
          </Link>
          <Link
            href="/legal/consultation-policy"
            className="rounded-md px-2 py-2 hover:bg-muted hover:text-navy"
          >
            Consultation
          </Link>
          <Link href="/legal/privacy" className="rounded-md px-2 py-2 hover:bg-muted hover:text-navy">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
