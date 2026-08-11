import { apiHandler, jsonFail, jsonOk, jsonOkList, parsePagination } from "@/lib/api/response";
import { requirePerm, requireUser, requireRole } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { createCoverageSchema } from "@/lib/validations/coverage.schema";
import {
  dismissStaleOpenCoverage,
  enqueueHearingCoverage,
} from "@/lib/hearings/coverage";
import { istDisplayDate } from "@/lib/utils/ist";

function isAdminOrSub(user: { roles: string[] }) {
  return user.roles.includes("admin") || user.roles.includes("sub_admin");
}

export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminOrSub(user)) {
    const edit = await requirePerm(request, "cases", "edit");
    if (!edit.user) return edit.response;
  }

  await dismissStaleOpenCoverage();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() || "open";
  const { page, pageSize, skip } = parsePagination(searchParams);

  const where = { status };
  const [rows, total] = await Promise.all([
    prisma.hearingCoverageItem.findMany({
      where,
      orderBy: { hearingDate: "asc" },
      skip,
      take: pageSize,
    }),
    prisma.hearingCoverageItem.count({ where }),
  ]);

  return jsonOkList(
    rows.map((r) => ({
      unitId: r.unitId,
      hearingUnitId: r.hearingUnitId,
      caseUnitId: r.caseUnitId,
      originalAdvocateMobile: r.originalAdvocateMobile,
      hearingDate: r.hearingDate.toISOString(),
      hearingDateLabel: istDisplayDate(r.hearingDate),
      reason: r.reason,
      reasonNote: r.reasonNote,
      status: r.status,
      suggestedMobiles: r.suggestedMobiles,
      coveringMobile: r.coveringMobile,
      notes: r.notes,
    })),
    { page, pageSize, total }
  );
});

export const POST = apiHandler(async (request) => {
  const { user, response } = await requireRole(request, ["admin", "sub_admin"]);
  if (!user) return response;

  const raw = await request.json();
  const parsed = createCoverageSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const input = parsed.data;
  if (input.reason === "other" && !input.reasonNote?.trim()) {
    return jsonFail("VALIDATION", "Reason note is required for other", 400);
  }

  const hearing = await prisma.hearing.findUnique({
    where: { unitId: input.hearingUnitId },
  });
  if (!hearing) return jsonFail("NOT_FOUND", "Hearing not found", 404);

  const result = await enqueueHearingCoverage({
    hearingId: hearing.id,
    reason: input.reason,
    reasonNote: input.reasonNote || undefined,
    createdById: user.id,
  });
  if (!result) {
    return jsonFail("VALIDATION", "Could not open coverage for this hearing", 400);
  }

  return jsonOk({ coverageUnitId: result.unitId, created: result.created }, 201);
});
