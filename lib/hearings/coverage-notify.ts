import { prisma } from "@/lib/db/prisma";
import { normalizeMobile } from "@/lib/auth/mobile";
import {
  notifyUsers,
  type NotifyInput,
} from "@/lib/notifications/notify";
import { istDisplayDate } from "@/lib/utils/ist";

export type CoverageNotifyKind =
  | "opened"
  | "covered"
  | "reassigned"
  | "adjourned"
  | "dismissed"
  | "leave_cleared";

async function findAdminsAndSubAdmins() {
  return prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ roles: { has: "admin" } }, { roles: { has: "sub_admin" } }],
    },
    select: { id: true, unitId: true, mobile: true },
  });
}

async function findByMobile(mobile: string | null | undefined) {
  const m = normalizeMobile(mobile ?? "");
  if (!m) return null;
  return prisma.user.findFirst({
    where: { mobile: m, isActive: true },
    select: { id: true, unitId: true, name: true, mobile: true },
  });
}

export async function notifyCoverageEvent(input: {
  kind: CoverageNotifyKind;
  caseUnitId: string;
  caseLabel: string;
  courtName?: string | null;
  hearingDate: Date;
  originalMobile: string;
  coveringMobile?: string | null;
  newPrimaryMobile?: string | null;
  reason?: string;
  reasonNote?: string;
  href: string;
  actorUserId?: string;
}): Promise<void> {
  const dateLabel = istDisplayDate(input.hearingDate);
  const court = input.courtName || "court";
  const admins = await findAdminsAndSubAdmins();
  const original = await findByMobile(input.originalMobile);
  const covering = await findByMobile(input.coveringMobile);
  const newPrimary = await findByMobile(input.newPrimaryMobile);

  const inputs: NotifyInput[] = [];
  const push = (
    user: { id: string; unitId: string } | null | undefined,
    type: string,
    title: string,
    body: string
  ) => {
    if (!user) return;
    if (input.actorUserId && user.id === input.actorUserId) {
      // Still notify actor if they are covering/target — only skip pure admin fan-out later
    }
    inputs.push({
      userId: user.id,
      userUnitId: user.unitId,
      type,
      title,
      body,
      href: input.href,
      meta: {
        kind: input.kind,
        caseUnitId: input.caseUnitId,
      },
    });
  };

  const baseBody = `${input.caseLabel} · ${court} · ${dateLabel}${
    input.reasonNote ? ` · ${input.reasonNote}` : ""
  }`;

  switch (input.kind) {
    case "opened":
      for (const a of admins) {
        push(
          a,
          "coverage_needed",
          "Coverage needed",
          `${baseBody} — primary unavailable (${input.reason ?? "leave"})`
        );
      }
      push(
        original,
        "coverage_needed",
        "Your hearing needs coverage",
        baseBody
      );
      break;
    case "covered":
      push(
        covering,
        "coverage_assigned",
        "You are covering a hearing",
        `${baseBody} (covering for ${original?.name || input.originalMobile})`
      );
      push(
        original,
        "coverage_assigned",
        "Someone will cover your hearing",
        `${covering?.name || input.coveringMobile} will appear — ${baseBody}`
      );
      for (const a of admins) {
        push(
          a,
          "coverage_assigned",
          "Hearing cover assigned",
          `${covering?.name || input.coveringMobile} covers ${baseBody}`
        );
      }
      break;
    case "reassigned":
      push(
        newPrimary,
        "coverage_assigned",
        "You are now primary advocate",
        baseBody
      );
      push(
        original,
        "coverage_assigned",
        "Primary advocate changed",
        `${newPrimary?.name || input.newPrimaryMobile} is now primary — ${baseBody}`
      );
      for (const a of admins) {
        push(a, "coverage_assigned", "Case advocate reassigned", baseBody);
      }
      break;
    case "adjourned":
      push(
        covering || original,
        "hearing_adjourned",
        "Hearing adjourned",
        baseBody
      );
      for (const a of admins) {
        push(a, "hearing_adjourned", "Hearing adjourned", baseBody);
      }
      break;
    case "dismissed":
    case "leave_cleared":
      push(
        original,
        "coverage_needed",
        input.kind === "leave_cleared"
          ? "Coverage cleared — leave cancelled"
          : "Coverage closed",
        baseBody
      );
      for (const a of admins) {
        push(
          a,
          "coverage_needed",
          input.kind === "leave_cleared"
            ? "Coverage cleared — leave cancelled"
            : "Coverage dismissed",
          baseBody
        );
      }
      break;
  }

  if (inputs.length) await notifyUsers(inputs);
}
