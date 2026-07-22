import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh grid-cols-1 bg-white md:grid-cols-2">
      {/* Compact brand strip on phone; full hero from md */}
      <aside className="flex items-center justify-center bg-navy px-4 py-4 sm:py-5 md:min-h-dvh md:px-8 md:py-8 lg:px-10 xl:px-14">
        <div className="flex w-full flex-row items-center justify-center gap-3 text-left md:flex-col md:text-center">
          <Image
            src="/images/mlf-logo-en.jpeg"
            alt="Manitham Law Foundation"
            width={240}
            height={240}
            priority
            className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14 md:h-40 md:w-40 lg:h-52 lg:w-52 xl:h-56 xl:w-56"
          />
          <div className="min-w-0 md:mt-4 md:flex md:flex-col md:items-center">
            <span
              aria-hidden
              className="mb-2 hidden h-px w-8 bg-gold md:block"
            />
            <p className="truncate text-sm font-medium text-white/90 md:mt-1 md:text-center">
              Manitham Law Foundation
            </p>
          </div>
        </div>
      </aside>

      <section className="flex flex-1 items-start justify-center px-4 py-6 sm:items-center sm:px-6 sm:py-8 md:min-h-dvh md:px-8 lg:px-16 xl:px-20">
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
