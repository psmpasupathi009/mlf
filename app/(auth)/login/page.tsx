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
            src="/images/mlf-logo-en.jpeg"
            alt="Manitham Law Foundation"
            width={240}
            height={240}
            priority
            className="h-24 w-24 object-contain sm:h-32 sm:w-32 md:h-44 md:w-44 lg:h-52 lg:w-52 xl:h-56 xl:w-56"
          />
          <span
            aria-hidden
            className="mt-5 block h-px w-6 bg-gold sm:mt-6 sm:w-8 md:w-10"
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
