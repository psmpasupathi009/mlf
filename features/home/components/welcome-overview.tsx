"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
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
  UserCheck,
  UserX,
  CheckCircle2,
} from "lucide-react";
import type { PublicUser } from "@/lib/auth/session";
import { isModuleEnabled } from "@/config/company/modules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";
import { UnitIdBadge } from "@/shared/components/data/unit-id-badge";
import { cn } from "@/lib/utils/cn";
import { PersonChip } from "@/shared/components/user/person-chip";
import { personDisplayName, personFirstName } from "@/shared/lib/person";

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
  advocateUnitId?: string | null;
  advocatePhotoUrl?: string | null;
};

type AdvocateLoad = {
  mobile: string;
  name: string;
  today: number;
  week: number;
};

type AdminStaffPresence = {
  unitId: string;
  name: string;
  mobile: string | null;
  photoUrl?: string | null;
  checkedIn: boolean;
  checkedOut: boolean;
  status?: "absent" | "in" | "out" | "on_leave";
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
    onApprovedLeaveToday?: boolean;
    pendingLeaveApprovals: number | null;
  };
  adminBoard?: {
    staff?: AdminStaffPresence[];
    advocates: AdminStaffPresence[];
    counts?: {
      total: number;
      present: number;
      out: number;
      onLeave: number;
      absent: number;
    };
    checkedInCount: number;
    advocateCount: number;
  };
};

type DayKindFilter = "all" | "appointments" | "hearings";

type TimelineRow = {
  key: string;
  kind: "appointment" | "hearing";
  sortAt: number;
  timeLabel: string;
  title: string;
  href: string;
  client: string;
  advocate: ReactNode;
  advocateLabel: string;
  detail: string;
  refId: string;
  advocateMobile: string | null;
};

function rupee(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function tenDigits(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  const d = mobile.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("91")) return d.slice(-10);
  if (d.length === 10) return d;
  return d.slice(-10) || null;
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

function formatHearingTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function WelcomeOverview({ user }: WelcomeOverviewProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [advocateFilter, setAdvocateFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<DayKindFilter>("all");
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

  const myMobile = tenDigits(user?.mobile);

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

  const firstName = personFirstName({ name: user?.name, fallback: "" });
  const todayHearings = summary?.cases?.todayHearings ?? [];

  const officePresence = useMemo(() => {
    const roster =
      summary?.adminBoard?.staff ?? summary?.adminBoard?.advocates ?? [];
    const counts = summary?.adminBoard?.counts;

    type BoardRow = {
      key: string;
      name: string;
      mobile: string | null;
      photoUrl?: string | null;
      status: "absent" | "in" | "out" | "on_leave" | "unknown";
      showAttendance: boolean;
    };

    const statusRank = {
      absent: 0,
      on_leave: 1,
      out: 2,
      in: 3,
      unknown: 4,
    } as const;

    const rows: BoardRow[] = roster.map((a) => {
      const status: BoardRow["status"] =
        a.status ??
        (a.checkedOut ? "out" : a.checkedIn ? "in" : "absent");
      return {
        key: a.unitId,
        name: personDisplayName({
          name: a.name,
          mobile: a.mobile,
          unitId: a.unitId,
        }),
        mobile: a.mobile,
        photoUrl: a.photoUrl,
        showAttendance: true,
        status,
      };
    });

    rows.sort((a, b) => {
      const rank = statusRank[a.status] - statusRank[b.status];
      if (rank !== 0) return rank;
      return a.name.localeCompare(b.name);
    });

    const presenceStats = counts
      ? {
          absent: counts.absent,
          present: counts.present,
          out: counts.out,
          onLeave: counts.onLeave,
        }
      : {
          absent: rows.filter((a) => a.status === "absent").length,
          present: rows.filter((a) => a.status === "in").length,
          out: rows.filter((a) => a.status === "out").length,
          onLeave: rows.filter((a) => a.status === "on_leave").length,
        };

    return { rows, presenceStats };
  }, [summary?.adminBoard]);

  const timelineRows = useMemo(() => {
    const rows: TimelineRow[] = [];

    if (moduleOn("appointments") && can("appointments.view")) {
      for (const a of summary?.appointments?.todayList ?? []) {
        rows.push({
          key: `appt-${a.unitId}`,
          kind: "appointment",
          sortAt: new Date(a.scheduledAt).getTime(),
          timeLabel: a.timeLabel,
          title: a.title,
          href: "/appointments",
          client: a.clientName ?? "No client",
          advocate:
            a.advocateName || a.advocateMobile ? (
              <PersonChip
                name={a.advocateName}
                photoUrl={a.advocatePhotoUrl}
                mobile={a.advocateMobile}
                unitId={a.advocateUnitId}
              />
            ) : (
              <span className="text-amber-700 dark:text-amber-400">Unassigned</span>
            ),
          advocateLabel:
            a.advocateName?.trim() ||
            (a.advocateMobile ? `+91 ${a.advocateMobile}` : "Unassigned"),
          detail: [
            a.mode,
            `${a.durationMin} min`,
            a.location,
          ]
            .filter(Boolean)
            .join(" · "),
          refId: a.unitId,
          advocateMobile: a.advocateMobile,
        });
      }
    }

    if (moduleOn("cases") && can("cases.view")) {
      for (const h of todayHearings) {
        rows.push({
          key: `hearing-${h.caseUnitId}`,
          kind: "hearing",
          sortAt: h.nextHearingAt
            ? new Date(h.nextHearingAt).getTime()
            : Number.MAX_SAFE_INTEGER,
          timeLabel: formatHearingTime(h.nextHearingAt),
          title: h.clientName,
          href: `/cases/${h.caseUnitId}`,
          client: h.clientName,
          advocate: h.advocateName ?? h.advocateMobile ?? "—",
          advocateLabel: h.advocateName ?? h.advocateMobile ?? "—",
          detail:
            [h.courtName, h.district, h.caseType].filter(Boolean).join(" · ") ||
            "Court not set",
          refId: h.caseUnitId,
          advocateMobile: h.advocateMobile ?? null,
        });
      }
    }

    rows.sort((a, b) => a.sortAt - b.sortAt);

    return rows.filter((row) => {
      if (dayFilter === "appointments" && row.kind !== "appointment") {
        return false;
      }
      if (dayFilter === "hearings" && row.kind !== "hearing") return false;

      if (!isAdmin && myMobile) {
        const adv = tenDigits(row.advocateMobile);
        if (adv && adv !== myMobile) return false;
        if (!adv && row.kind === "appointment") return false;
      }

      if (advocateFilter === "all") return true;
      if (advocateFilter === "unassigned") return !row.advocateMobile;
      return tenDigits(row.advocateMobile) === tenDigits(advocateFilter);
    });
    // can/moduleOn are stable enough for this render; summary drives data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    summary?.appointments?.todayList,
    todayHearings,
    dayFilter,
    advocateFilter,
    isAdmin,
    myMobile,
    user?.permissions,
  ]);

  const attention: {
    label: string;
    value: string;
    href: string;
    cta: string;
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
      cta: "Open",
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
      cta: "Review",
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
      href: "/hrms?section=leave",
      cta: "Approve",
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
      cta: "Assign",
      tone: "warning",
    });
  }

  const metrics: {
    label: string;
    value: string;
    hint?: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
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
      href: "/diary",
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

  const canSeeTimeline =
    (moduleOn("appointments") && can("appointments.view")) ||
    (moduleOn("cases") && can("cases.view"));

  const dayFilters: { id: DayKindFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "appointments", label: "Appointments" },
    { id: "hearings", label: "Hearings" },
  ];

  return (
    <section className="space-y-6">
      <div
        className="overflow-hidden rounded-2xl border border-brand/30 text-brand-foreground shadow-sm"
        style={{ backgroundColor: "var(--brand)" }}
      >
        <div className="relative px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7">
          <div className="relative flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-white/70">{formatTodayLabel()}</p>
                <span className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/90">
                  {isAdmin ? "Admin office board" : "My day"}
                </span>
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
                {greetingLabel()}
                {firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">
                {isAdmin
                  ? "Act on blockers, then scan today’s schedule and who’s in."
                  : "Your schedule for today — appointments, hearings, and attendance."}
              </p>
            </div>

            <div className="flex w-full shrink-0 flex-row flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              {moduleOn("appointments") && can("appointments.create") ? (
                <Button
                  asChild
                  size="sm"
                  variant="on-brand-solid"
                  className="shrink-0"
                >
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
                  variant="on-brand-solid"
                  className="shrink-0"
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
                  variant="on-brand-solid"
                  className="shrink-0"
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
                  variant="on-brand-solid"
                  className="shrink-0"
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
              className="h-24 animate-pulse rounded-xl border border-border/80 bg-card"
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
                    <span className="rounded-lg bg-secondary p-2.5 text-navy transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                      <Icon className="size-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* 1. Action queue */}
      {!loading ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-navy">Action queue</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Items that need a decision before the day runs
            </p>
          </div>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/40 sm:px-5">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-navy">All clear</p>
                <p className="text-xs text-muted-foreground">
                  No blockers on the board right now.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead className="hidden sm:table-cell">Detail</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attention.map((item) => (
                  <TableRow key={item.label}>
                    <TableCell>
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg",
                            item.tone === "danger" &&
                              "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
                            item.tone === "warning" &&
                              "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                            item.tone === "info" &&
                              "bg-secondary text-navy"
                          )}
                        >
                          <AlertTriangle className="size-3.5" />
                        </span>
                        <div className="min-w-0">
                          <span className="font-medium text-navy">
                            {item.label}
                          </span>
                          <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                            {item.value}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {item.value}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                      >
                        <Link href={item.href}>
                          {item.cta}
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      ) : null}

      {/* 2. Today timeline */}
      {canSeeTimeline ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-navy">
                {isAdmin ? "Today’s schedule" : "My day"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Appointments and hearings in one timeline
                {advocateFilter !== "all" ? " · filtered by advocate" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {advocateFilter !== "all" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAdvocateFilter("all")}
                >
                  Clear advocate
                </Button>
              ) : null}
              {moduleOn("appointments") && can("appointments.view") ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/appointments?hearing=today">
                    Appointments
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
              {moduleOn("cases") && can("cases.view") ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/diary">
                    Diary
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {dayFilters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setDayFilter(f.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  dayFilter === f.id
                    ? "bg-brand text-brand-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-navy"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="h-44 animate-pulse rounded-xl border border-border/80 bg-card" />
          ) : timelineRows.length === 0 ? (
            <div className="rounded-xl border border-border/80 bg-card px-5 py-12 text-center shadow-sm shadow-black/2">
              <CalendarClock className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium text-navy">
                Nothing scheduled today
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isAdmin
                  ? "Book an appointment or check tomorrow’s cause list."
                  : "No appointments or hearings assigned to you today."}
              </p>
              {can("appointments.create") ? (
                <Button asChild size="sm" className="mt-4">
                  <Link href="/appointments?new=1">Book appointment</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Time</TableHead>
                  <TableHead className="hidden w-28 sm:table-cell">Type</TableHead>
                  <TableHead>Title / client</TableHead>
                  <TableHead className="hidden md:table-cell">Advocate</TableHead>
                  <TableHead className="hidden lg:table-cell">Detail</TableHead>
                  <TableHead className="hidden md:table-cell">Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timelineRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="whitespace-nowrap font-semibold text-navy">
                      {row.timeLabel}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge
                        variant={
                          row.kind === "hearing" ? "warning" : "muted"
                        }
                        className="capitalize"
                      >
                        {row.kind === "hearing" ? (
                          <CalendarDays className="mr-1 size-3" />
                        ) : (
                          <CalendarClock className="mr-1 size-3" />
                        )}
                        {row.kind === "hearing" ? "Hearing" : "Appt"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={row.href}
                        className="font-medium text-navy hover:underline"
                      >
                        {row.title}
                      </Link>
                      {row.kind === "appointment" &&
                      row.client !== row.title ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.client}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground sm:hidden">
                        {row.kind === "hearing" ? "Hearing" : "Appt"}
                        {row.advocateLabel ? ` · ${row.advocateLabel}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{row.advocate}</TableCell>
                    <TableCell className="hidden max-w-52 truncate text-muted-foreground lg:table-cell">
                      {row.detail}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <UnitIdBadge value={row.refId} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      ) : null}

      {/* 3. Office presence — compact counts; details in HRMS */}
      {isAdmin && !loading && officePresence.rows.some((a) => a.showAttendance) ? (
        <Link
          href="/hrms"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-sm shadow-black/2 transition-colors hover:border-navy/30 sm:px-5"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">Who’s in today</p>
              <p className="text-xs text-muted-foreground">
                Full office · open HRMS for the list
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                <UserX className="size-3.5" />
                {officePresence.presenceStats.absent} absent
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                <UserCheck className="size-3.5" />
                {officePresence.presenceStats.present} present
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {officePresence.presenceStats.out} checked out
              </span>
              {officePresence.presenceStats.onLeave > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {officePresence.presenceStats.onLeave} on leave
                </span>
              ) : null}
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-navy">
            HRMS
            <ArrowRight className="size-3.5" />
          </span>
        </Link>
      ) : null}

      {/* Personal attendance */}
      {moduleOn("hrms") &&
      can("hrms.own_attendance") &&
      summary?.hrms ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3.5 shadow-sm shadow-black/2 sm:px-5">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="size-5 text-navy" />
            <div>
              <p className="text-sm font-semibold text-navy">Your attendance</p>
              <p className="text-xs text-muted-foreground">
                {summary.hrms.onApprovedLeaveToday
                  ? "On approved leave today"
                  : summary.hrms.checkedOutToday
                    ? "Checked out"
                    : summary.hrms.checkedInToday
                      ? "Checked in"
                      : "Not checked in"}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/hrms">Open HRMS</Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
