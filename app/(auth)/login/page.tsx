import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh grid-cols-2 bg-white">
      {/* Left — brand */}
      <aside className="flex min-h-dvh items-center justify-center bg-navy px-3 py-8 sm:px-6 md:px-8 lg:px-10 xl:px-14">
        <div className="flex w-full flex-col items-center text-center">
          <Image
            src="/images/mlf.jpeg"
            alt="Manitham Law Foundation"
            width={240}
            height={240}
            priority
            className="h-20 w-20 object-contain sm:h-28 sm:w-28 md:h-40 md:w-40 lg:h-48 lg:w-48 xl:h-52 xl:w-52"
          />
          <h1 className="mt-4 w-full text-center text-[0.7rem] leading-snug font-semibold tracking-wide text-white sm:mt-6 sm:text-sm md:mt-7 md:text-xl lg:mt-8 lg:whitespace-nowrap lg:text-[clamp(1.1rem,2vw,1.75rem)] xl:text-[1.85rem]">
            Manitham Law Foundation
          </h1>
          <span
            aria-hidden
            className="mt-3 block h-px w-6 bg-gold sm:mt-4 sm:w-8 md:mt-5 md:w-10"
          />
        </div>
      </aside>

      {/* Right — form */}
      <section className="flex min-h-dvh items-center justify-center px-3 py-8 sm:px-6 md:px-10 lg:px-16 xl:px-20">
        <div className="w-full max-w-[21.5rem]">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
