import type { Prisma } from "@prisma/client";
import { istDateKey, istDayBounds } from "@/lib/utils/ist";
import { containsInsensitive } from "@/lib/db/search";
import {
  OPEN_CASE_STATUSES,
  PRE_NUMBER_STATUSES,
} from "@/config/company/case-pipeline";

export type CaseListFilters = {
  q?: string;
  status?: string;
  clientUnitId?: string;
  hearing?: string;
  missingCourtNumber?: boolean;
  battaDue?: boolean;
};

export function parseCaseListFilters(
  searchParams: URLSearchParams
): CaseListFilters {
  return {
    q: searchParams.get("q")?.trim() || undefined,
    status: searchParams.get("status")?.trim() || undefined,
    clientUnitId: searchParams.get("clientUnitId")?.trim() || undefined,
    hearing: searchParams.get("hearing")?.trim() || undefined,
    missingCourtNumber: searchParams.get("missingCourtNumber") === "1",
    battaDue:
      searchParams.get("battaDue") === "1" ||
      searchParams.get("battaDue") === "true",
  };
}

/** Shared where clause for cases list + Excel export. */
export function buildCaseListWhere(
  filters: CaseListFilters
): Prisma.CaseWhereInput {
  const {
    q,
    status,
    clientUnitId,
    hearing,
    missingCourtNumber,
    battaDue,
  } = filters;

  const where: Prisma.CaseWhereInput = {
    ...(clientUnitId ? { clientUnitId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(battaDue ? { battaDue: true } : {}),
    ...(q
      ? {
          OR: [
            { caseNumber: containsInsensitive(q) },
            { unitId: containsInsensitive(q) },
            { clientUnitId: containsInsensitive(q) },
            { courtName: containsInsensitive(q) },
            { opposingParty: containsInsensitive(q) },
          ],
        }
      : {}),
  };

  if (missingCourtNumber) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: [{ caseNumber: null }, { caseNumber: "" }] },
      { status: { in: [...PRE_NUMBER_STATUSES] } },
    ];
  }

  if (hearing === "today" || hearing === "week") {
    const todayKey = istDateKey();
    const { start, end } = istDayBounds(todayKey);
    const rangeEnd =
      hearing === "week"
        ? new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
        : end;
    where.nextHearingAt = {
      gte: start,
      lte: hearing === "today" ? end : rangeEnd,
    };
    if (!status) {
      where.status = { in: [...OPEN_CASE_STATUSES] };
    }
  }

  return where;
}
