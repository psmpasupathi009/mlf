import Link from "next/link";

type SiteFooterProps = {
  compact?: boolean;
};

export function SiteFooter({ compact = false }: SiteFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-white">
      <div
        className={`mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 ${
          compact ? "py-4" : "py-5"
        }`}
      >
        <p>© {year} Manitham Law Foundation. All rights reserved.</p>
        <div className="flex gap-4">
          <Link href="#" className="hover:text-navy">
            Privacy
          </Link>
          <Link href="#" className="hover:text-navy">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
