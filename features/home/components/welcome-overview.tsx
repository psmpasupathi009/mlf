"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  Plus,
  Scale,
  Users,
  ClipboardCheck,
  ArrowRight,
  Phone,
  Video,
  Building2,
  UserCheck,
} from "lucide-react";
import type { PublicUser } from "@/lib/auth/session";
import { isModuleEnabled } from "@/config/company/modules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { UnitIdBadge } from "@/shared/components/data/unit-id-badge";
import { cn } from "@/lib/utils/cn";

type WelcomeOverviewProps = {
  user: PublicUser | null;
};

type TodayHearing = {
  caseUnitId: string;
  caseNumber: string | null;
  caseType?: string | null;
  courtName: string | null;
  district: string | null;
  status: string;
  nextHearingAt: string | null;
  clientName: string;
  clientUnitId: string;
  clientMobile: string | null;
  advocateName?: string | null;
  advocateMobile?: string | null;
};

type TodayAppointment = {
  unitId: string;
  title: string;
  scheduledAt: string;
  timeLabel: string;
  durationMin: number;
  mode: string;
  location: string | null;
  notes: string | null;
  clientName: string | null;
  clientUnitId: string | null;
  clientMobile: string | null;
  advocateName: string | null;
  advocateMobile: string | null;
};

type AdvocateLoad = {
  mobile: string;
  name: string;
  today: number;
  week: number;
};

type AdminAdvocate = {
  unitId: string;
  name: string;
  mobile: string | null;
  checkedIn: boolean;
  checkedOut: boolean;
};

type DashboardSummary = {
  todayKey?: string;
  isOfficeAdmin?: boolean;
  employees?: { total: number; active: number; advocates?: number };
  clients?: { total: number };
  cases?: {
    total: number;
    pending: number;
    listed: number;
    open: number;
    weekHearings: number;
    missingCourtNumber: number;
    todayHearings: TodayHearing[];
  };
  accounts?: {
    pendingAmount: number;
    pendingCount: number;
    paidThisMonth: number;
  };
  appointments?: {
    today: number;
    week: number;
    todayList: TodayAppointment[];
    weekList?: TodayAppointment[];
    byAdvocate: AdvocateLoad[];
  };
  hrms?: {
    checkedInToday: boolean;
    checkedOutToday: boolean;
    pendingLeaveApprovals: number | null;
  };
  adminBoard?: {
    advocates: AdminAdvocate[];
    checkedInCount: number;
    advocateCount: number;
  };
};

function rupee(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function greetingLabel(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }).format(date)
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTodayLabel(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function ModeIcon({ mode }: { mode: string }) {
  if (mode === "call") return <Phone className="size-3.5" />;
  if (mode === "video") return <Video className="size-3.5" />;
  return <Building2 className="size-3.5" />;
}

export function WelcomeOverview({ user }: WelcomeOverviewProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [advocateFilter, setAdvocateFilter] = useState<string>("all");
  const perms = useMemo(
    () => new Set(user?.permissions ?? []),
    [user?.permissions]
  );

  const can = (perm: string) => perms.has(perm);
  const moduleOn = (m: Parameters<typeof isModuleEnabled>[0]) =>
    isModuleEnabled(m);
  const isAdmin =
    summary?.isOfficeAdmin ||
    user?.roles.includes("admin") ||
    user?.roles.includes("sub_admin");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { ok, data } = await apiFetch<{ summary: DashboardSummary }>(
        "/api/v1/dashboard/summary"
      );
      if (!cancelled) {
        if (ok && data && typeof data === "object" && "summary" in data) {
          setSummary((data as { summary: DashboardSummary }).summary);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const todayHearings = summary?.cases?.todayHearings ?? [];
  const todayAppts = useMemo(() => {
    const list = summary?.appointments?.todayList ?? [];
    if (advocateFilter === "all") return list;
    if (advocateFilter === "unassigned") {
      return list.filter((a) => !a.advocateMobile);
    }
    return list.filter((a) => a.advocateMobile === advocateFilter);
  }, [summary?.appointments?.todayList, advocateFilter]);

  const attention: {
    label: string;
    value: string;
    href: string;
    tone: "warning" | "danger" | "info";
  }[] = [];

  if (
    moduleOn("cases") &&
    can("cases.view") &&
    (summary?.cases?.missingCourtNumber ?? 0) > 0
  ) {
    attention.push({
      label: "Cases missing court number",
      value: String(summary!.cases!.missingCourtNumber),
      href: "/cases?missingCourtNumber=1",
      tone: "warning",
    });
  }
  if (
    moduleOn("accounts") &&
    can("accounts.view") &&
    (summary?.accounts?.pendingCount ?? 0) > 0
  ) {
    attention.push({
      label: "Pending payments",
      value: `${summary!.accounts!.pendingCount} · ${rupee(summary!.accounts!.pendingAmount)}`,
      href: "/accounts",
      tone: "danger",
    });
  }
  if (
    moduleOn("hrms") &&
    can("hrms.approve_leave") &&
    (summary?.hrms?.pendingLeaveApprovals ?? 0) > 0
  ) {
    attention.push({
      label: "Leave approvals waiting",
      value: String(summary!.hrms!.pendingLeaveApprovals),
      href: "/hrms",
      tone: "info",
    });
  }
  if (
    moduleOn("appointments") &&
    can("appointments.view") &&
    (summary?.appointments?.todayList.filter((a) => !a.advocateMobile).length ??
      0) > 0
  ) {
    attention.push({
      label: "Appointments without advocate",
      value: String(
        summary!.appointments!.todayList.filter((a) => !a.advocateMobile).length
      ),
      href: "/appointments?hearing=today",
      tone: "warning",
    });
  }

  const metrics: {
    label: string;
    value: string;
    hint?: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [];

  if (moduleOn("cases") && can("cases.view") && summary?.cases) {
    metrics.push({
      label: "Open cases",
      value: String(summary.cases.open),
      hint: `${summary.cases.pending} pending · ${summary.cases.listed} listed`,
      href: "/cases",
      icon: Scale,
    });
    metrics.push({
      label: "Hearings this week",
      value: String(summary.cases.weekHearings),
      hint: `${todayHearings.length} today`,
      href: "/cases?hearing=today",
      icon: CalendarDays,
    });
  }
  if (
    moduleOn("appointments") &&
    can("appointments.view") &&
    summary?.appointments
  ) {
    metrics.push({
      label: "Appointments today",
      value: String(summary.appointments.today),
      hint: `${summary.appointments.week} this week`,
      href: "/appointments?hearing=today",
      icon: CalendarClock,
    });
  }
  if (moduleOn("clients") && can("clients.view") && summary?.clients) {
    metrics.push({
      label: "Clients",
      value: String(summary.clients.total),
      href: "/clients",
      icon: Briefcase,
    });
  }
  if (moduleOn("employees") && can("employees.view") && summary?.employees) {
    metrics.push({
      label: isAdmin ? "Advocates" : "Active staff",
      value: String(
        isAdmin
          ? (summary.employees.advocates ?? summary.employees.active)
          : summary.employees.active
      ),
      hint: isAdmin
        ? `${summary.employees.active} staff active`
        : undefined,
      href: "/employees",
      icon: Users,
    });
  }
  if (moduleOn("accounts") && can("accounts.view") && summary?.accounts) {
    metrics.push({
      label: "Paid this month",
      value: rupee(summary.accounts.paidThisMonth),
      hint:
        summary.accounts.pendingCount > 0
          ? `${summary.accounts.pendingCount} pending`
          : undefined,
      href: "/accounts",
      icon: CircleDollarSign,
    });
  }

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-navy text-white shadow-sm">
        <div className="relative px-5 py-6 sm:px-7 sm:py-7">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              background:
                "radial-gradient(ellipse at top right, #b8953f 0%, transparent 55%)",
            }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-white/65">{formatTodayLabel()}</p>
                {isAdmin ? (
                  <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-[11px] font-medium text-gold">
                    Admin office board
                  </span>
                ) : null}
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {greetingLabel()}
                {firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
                {isAdmin
                  ? "All advocate appointments, today’s hearings, cash, and staff — one board."
                  : "Office overview for today — hearings, appointments, and what needs attention."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {moduleOn("appointments") && can("appointments.create") ? (
                <Button asChild variant="gold" size="sm" className="shadow-none">
                  <Link href="/appointments?new=1">
                    <Plus className="size-4" />
                    Book appointment
                  </Link>
                </Button>
              ) : null}
              {moduleOn("clients") && can("clients.create") ? (
                <Button
                  asChild
                  size="sm"
                  className="border-0 bg-white text-navy hover:bg-white/90"
                >
                  <Link href="/clients?new=1">
                    <Plus className="size-4" />
                    New client
                  </Link>
                </Button>
              ) : null}
              {moduleOn("cases") && can("cases.create") ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/cases?new=1">
                    <Plus className="size-4" />
                    Register case
                  </Link>
                </Button>
              ) : null}
              {moduleOn("accounts") && can("accounts.create") ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/accounts?new=1">
                    <Plus className="size-4" />
                    Add payment
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-border/80 bg-white"
            />
          ))}
        </div>
      ) : metrics.length > 0 ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.label} href={m.href} className="group block">
                <Card className="h-full transition-colors group-hover:border-navy/30">
                  <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {m.label}
                      </p>
                      <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-navy">
                        {m.value}
                      </p>
                      {m.hint ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {m.hint}
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-lg bg-[#eef1f6] p-2.5 text-navy transition-colors group-hover:bg-navy group-hover:text-white">
                      <Icon className="size-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* Admin: advocate load + attendance */}
      {isAdmin &&
      !loading &&
      ((summary?.appointments?.byAdvocate.length ?? 0) > 0 ||
        summary?.adminBoard) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {moduleOn("appointments") &&
          can("appointments.view") &&
          summary?.appointments ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/80 px-4 py-3 sm:px-5 sm:py-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-navy">
                    Advocate appointment load
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Today / this week (IST)
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link href="/appointments">
                    All
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
              <CardContent className="p-0">
                {(summary.appointments.byAdvocate.length ?? 0) === 0 ? (
                  <p className="px-5 py-8 text-sm text-muted-foreground">
                    No scheduled appointments yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/80">
                    {summary.appointments.byAdvocate.map((a) => (
                      <li key={a.mobile || a.name}>
                        <button
                          type="button"
                          onClick={() =>
                            setAdvocateFilter(
                              a.mobile
                                ? advocateFilter === a.mobile
                                  ? "all"
                                  : a.mobile
                                : advocateFilter === "unassigned"
                                  ? "all"
                                  : "unassigned"
                            )
                          }
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/50",
                            (a.mobile && advocateFilter === a.mobile) ||
                              (!a.mobile && advocateFilter === "unassigned")
                              ? "bg-muted/40"
                              : null
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-navy">
                              {a.name}
                            </p>
                            {a.mobile ? (
                              <p className="text-xs text-muted-foreground">
                                {a.mobile}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Badge variant="muted">{a.today} today</Badge>
                            <Badge variant="outline">{a.week} week</Badge>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {summary?.adminBoard ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/80 px-4 py-3 sm:px-5 sm:py-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-navy">
                    Advocate attendance today
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {summary.adminBoard.checkedInCount} /{" "}
                    {summary.adminBoard.advocateCount} checked in
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link href="/hrms">
                    HRMS
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
              <CardContent className="max-h-72 overflow-y-auto p-0">
                {summary.adminBoard.advocates.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-muted-foreground">
                    No active advocates in staff list.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/80">
                    {summary.adminBoard.advocates.map((a) => (
                      <li
                        key={a.unitId}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-navy">
                            {a.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {a.mobile ?? a.unitId}
                          </p>
                        </div>
                        <Badge
                          variant={a.checkedIn ? "muted" : "warning"}
                          className="shrink-0"
                        >
                          <UserCheck className="mr-1 size-3" />
                          {a.checkedOut
                            ? "Out"
                            : a.checkedIn
                              ? "In"
                              : "Absent"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* Today's appointments — full details */}
        {moduleOn("appointments") && can("appointments.view") ? (
          <Card className="overflow-hidden xl:row-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-navy">
                  Today’s appointments
                  {isAdmin ? " — all advocates" : ""}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {advocateFilter === "all"
                    ? "Full diary with client, advocate, mode"
                    : `Filtered · tap advocate load to clear`}
                </p>
              </div>
              <div className="flex gap-2">
                {advocateFilter !== "all" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAdvocateFilter("all")}
                  >
                    Clear filter
                  </Button>
                ) : null}
                <Button asChild variant="ghost" size="sm">
                  <Link href="/appointments?hearing=today">
                    Open list
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-lg bg-muted"
                    />
                  ))}
                </div>
              ) : todayAppts.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <CalendarClock className="mx-auto size-8 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-medium text-navy">
                    No appointments today
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Book a consultation and assign an advocate.
                  </p>
                  {can("appointments.create") ? (
                    <Button asChild size="sm" className="mt-4">
                      <Link href="/appointments?new=1">Book appointment</Link>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y divide-border/80">
                  {todayAppts.map((a) => (
                    <li key={a.unitId}>
                      <Link
                        href="/appointments"
                        className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-navy/5 px-2 py-0.5 text-xs font-semibold text-navy">
                              {a.timeLabel}
                            </span>
                            <p className="font-medium text-navy">{a.title}</p>
                            <UnitIdBadge value={a.unitId} />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {a.clientName
                              ? `Client: ${a.clientName}`
                              : "No client linked"}
                            {a.clientMobile ? ` · ${a.clientMobile}` : ""}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Advocate:{" "}
                            {a.advocateName ?? a.advocateMobile ?? (
                              <span className="text-amber-700">Unassigned</span>
                            )}
                            {a.location ? ` · ${a.location}` : ""}
                          </p>
                          {a.notes ? (
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {a.notes}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <Badge variant="outline" className="capitalize">
                            <ModeIcon mode={a.mode} />
                            <span className="ml-1">{a.mode}</span>
                          </Badge>
                          <Badge variant="muted">{a.durationMin} min</Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/80 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-navy">
                  Today’s hearings
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Cause list with advocate on record
                </p>
              </div>
              {moduleOn("cases") && can("cases.view") ? (
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <Link href="/cases?hearing=today">
                    Today’s list
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
            <CardContent className="p-0">
              {!moduleOn("cases") || !can("cases.view") ? (
                <p className="px-5 py-10 text-sm text-muted-foreground">
                  You don’t have access to cases.
                </p>
              ) : loading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-lg bg-muted"
                    />
                  ))}
                </div>
              ) : todayHearings.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <CalendarDays className="mx-auto size-7 text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium text-navy">
                    No hearings today
                  </p>
                </div>
              ) : (
                <ul className="max-h-80 divide-y divide-border/80 overflow-y-auto">
                  {todayHearings.map((h) => (
                    <li key={h.caseUnitId}>
                      <Link
                        href={`/cases/${h.caseUnitId}`}
                        className="block px-5 py-3.5 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-navy">{h.clientName}</p>
                          <UnitIdBadge value={h.caseUnitId} />
                          {h.caseNumber ? (
                            <Badge variant="outline">{h.caseNumber}</Badge>
                          ) : (
                            <Badge variant="warning">No court no.</Badge>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {[h.courtName, h.district, h.caseType]
                            .filter(Boolean)
                            .join(" · ") || "Court not set"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Adv:{" "}
                          {h.advocateName ?? h.advocateMobile ?? "—"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <div className="border-b border-border/80 px-5 py-4">
              <h2 className="text-base font-semibold text-navy">
                Needs attention
              </h2>
            </div>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  <div className="h-12 animate-pulse rounded-lg bg-muted" />
                </div>
              ) : attention.length === 0 ? (
                <div className="flex items-start gap-3 px-5 py-8">
                  <ClipboardCheck className="mt-0.5 size-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium text-navy">All clear</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      No blockers on the office board right now.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-border/80">
                  {attention.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50"
                      >
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg",
                            item.tone === "danger" && "bg-red-50 text-red-700",
                            item.tone === "warning" &&
                              "bg-amber-50 text-amber-800",
                            item.tone === "info" && "bg-[#eef1f6] text-navy"
                          )}
                        >
                          <AlertTriangle className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-navy">
                            {item.label}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.value}
                          </p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {moduleOn("hrms") && can("hrms.own_attendance") && summary?.hrms ? (
            <Card>
              <CardContent className="p-5">
                <h2 className="text-base font-semibold text-navy">
                  Your attendance
                </h2>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">Today</span>
                  <span className="font-medium text-navy">
                    {summary.hrms.checkedOutToday
                      ? "Checked out"
                      : summary.hrms.checkedInToday
                        ? "Checked in"
                        : "Not checked in"}
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/hrms">Open HRMS</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}
