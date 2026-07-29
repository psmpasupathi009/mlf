import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";
import { ThemeToggle } from "@/shared/components/theme/theme-toggle";
import { BrandMark } from "@/shared/components/brand/brand-mark";
import { brand } from "@/config/company/brand";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh grid-cols-1 bg-background md:grid-cols-2">
      {/* Compact brand strip on phone; full hero from md */}
      <aside className="relative flex items-center justify-center overflow-hidden bg-brand px-4 py-4 sm:py-5 md:min-h-dvh md:px-8 md:py-8 lg:px-10 xl:px-14">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-maroon md:w-1.5"
        />
        <div className="flex w-full flex-row items-center justify-center gap-3 text-left md:flex-col md:text-center">
          <BrandMark size="lg" priority />
          <div className="min-w-0 md:mt-4 md:flex md:flex-col md:items-center">
            <span
              aria-hidden
              className="mb-2 hidden h-0.5 w-10 rounded-full bg-gold md:block"
            />
            <span
              aria-hidden
              className="mb-2 hidden h-px w-6 bg-maroon/80 md:block"
            />
            <p className="truncate text-sm font-medium text-white/90 md:mt-1 md:text-center">
              {brand.name}
            </p>
          </div>
        </div>
      </aside>

      <section className="relative flex flex-1 items-start justify-center px-4 py-6 sm:items-center sm:px-6 sm:py-8 md:min-h-dvh md:px-8 lg:px-16 xl:px-20">
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-86">
          <LoginForm />
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-[11px] text-muted-foreground">
            <Link href="/legal/terms" className="py-1 hover:text-navy">
              Terms
            </Link>
            <Link
              href="/legal/consultation-policy"
              className="py-1 hover:text-navy"
            >
              Consultation
            </Link>
            <Link href="/legal/privacy" className="py-1 hover:text-navy">
              Privacy
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
