import type { PublicUser } from "@/lib/auth/session";

type WelcomeOverviewProps = {
  user: PublicUser | null;
};

export function WelcomeOverview({ user }: WelcomeOverviewProps) {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-gold uppercase">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-navy sm:text-4xl">
          Welcome{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
          You are signed in to Manitham Law Foundation. Homepage modules will be
          added here next.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Mobile
          </p>
          <p className="mt-2 text-lg font-semibold text-navy">+{user?.mobile}</p>
        </article>
        <article className="rounded-xl border border-border bg-white p-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Role
          </p>
          <p className="mt-2 text-lg font-semibold capitalize text-navy">
            {user?.role.replace("_", " ")}
          </p>
        </article>
        <article className="rounded-xl border border-border bg-white p-5 sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Status
          </p>
          <p className="mt-2 text-lg font-semibold text-navy">Active session</p>
        </article>
      </div>
    </section>
  );
}
