import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { compliance } from "@/config/company/compliance";
import {
  appointmentModeEnum,
  importAppointmentsSchema,
} from "@/lib/validations/appointments.schema";
import { normalizeMobile, displayMobile } from "@/lib/auth/mobile";
import {
  canBookForAnyAdvocate,
  resolveBookingAdvocateMobile,
} from "@/lib/appointments/booking-rules";
import { assertImportRateLimit } from "@/lib/rate-limit/guards";

type RowResult = {
  row: number;
  unitId: string | null;
  status: "ok" | "error";
  message: string;
};

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "appointments", "create");
  if (!user) return response;

  const limited = await assertImportRateLimit(request, user.unitId);
  if (limited) return limited;

  const raw = await request.json();
  const parsed = importAppointmentsSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
      parsed.error.issues
    );
  }
  const { dryRun, rows } = parsed.data;

  if (rows.length > compliance.csv.maxRows) {
    return jsonFail(
      "VALIDATION",
      `Max ${compliance.csv.maxRows} rows per import`,
      400
    );
  }

  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const scheduledAt = new Date(row.scheduledAt.trim());
    if (Number.isNaN(scheduledAt.getTime())) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Invalid scheduledAt (use ISO or YYYY-MM-DDTHH:mm)",
      });
      continue;
    }

    let durationMin = 30;
    if (row.durationMin?.trim()) {
      const n = Number(row.durationMin);
      if (!Number.isFinite(n) || n < 5 || n > 480) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: "durationMin must be 5–480",
        });
        continue;
      }
      durationMin = Math.round(n);
    }

    let mode: "office" | "call" | "video" = "office";
    if (row.mode?.trim()) {
      const modeParsed = appointmentModeEnum.safeParse(row.mode.trim());
      if (!modeParsed.success) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: "mode must be office|call|video",
        });
        continue;
      }
      mode = modeParsed.data;
    }

    let clientUnitId: string | undefined;
    if (row.clientUnitId?.trim()) {
      const client = await prisma.client.findUnique({
        where: { unitId: row.clientUnitId.trim() },
        select: { unitId: true },
      });
      if (!client) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: `Client not found: ${row.clientUnitId}`,
        });
        continue;
      }
      clientUnitId = client.unitId;
    } else if (row.clientMobile?.trim()) {
      const mobile = normalizeMobile(row.clientMobile);
      if (!mobile) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: "Invalid clientMobile",
        });
        continue;
      }
      const ten = displayMobile(mobile);
      const client = await prisma.client.findFirst({
        where: {
          OR: [
            { mobile },
            { mobile: ten },
            { mobile: `91${ten}` },
          ],
        },
        select: { unitId: true },
      });
      if (!client) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: `No client with mobile ${ten}`,
        });
        continue;
      }
      clientUnitId = client.unitId;
    }

    let caseId: string | undefined;
    let caseUnitId: string | undefined;
    if (row.caseUnitId?.trim()) {
      const caseItem = await prisma.case.findUnique({
        where: { unitId: row.caseUnitId.trim() },
        select: { id: true, unitId: true },
      });
      if (!caseItem) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: `Case not found: ${row.caseUnitId}`,
        });
        continue;
      }
      caseId = caseItem.id;
      caseUnitId = caseItem.unitId;
    }

    const resolved = resolveBookingAdvocateMobile({
      roles: user.roles,
      actorMobile: user.mobile,
      requestedMobile: row.advocateMobile,
    });
    if (!resolved.mobile) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: resolved.error ?? "Invalid advocateMobile",
      });
      continue;
    }

    if (canBookForAnyAdvocate(user.roles)) {
      const ten = resolved.mobile.replace(/\D/g, "").slice(-10);
      const advocate = await prisma.user.findFirst({
        where: {
          isActive: true,
          roles: { has: "advocate" },
          OR: [
            { mobile: resolved.mobile },
            { mobile: ten },
            { mobile: `91${ten}` },
          ],
        },
        select: { id: true },
      });
      if (!advocate) {
        results.push({
          row: rowNum,
          unitId: null,
          status: "error",
          message: "Advocate not found in office list",
        });
        continue;
      }
    }

    if (dryRun) {
      results.push({
        row: rowNum,
        unitId: null,
        status: "ok",
        message: "Will create (slot checks skipped on import)",
      });
      continue;
    }

    try {
      const unitId = await nextUnitId("appointment");
      const created = await prisma.appointment.create({
        data: {
          unitId,
          clientUnitId,
          caseId,
          caseUnitId,
          advocateMobile: resolved.mobile,
          title: row.title,
          scheduledAt,
          durationMin,
          mode,
          location: row.location?.trim() || undefined,
          notes: row.notes?.trim() || undefined,
          createdById: user.id,
        },
      });
      results.push({
        row: rowNum,
        unitId: created.unitId,
        status: "ok",
        message: "Created",
      });
    } catch {
      results.push({
        row: rowNum,
        unitId: null,
        status: "error",
        message: "Failed to save row",
      });
    }
  }

  if (!dryRun) {
    await writeAudit({
      actorUnitId: user.unitId,
      action: "appointment.import",
      entity: "Appointment",
      meta: {
        total: rows.length,
        succeeded: results.filter((r) => r.status === "ok").length,
        failed: results.filter((r) => r.status === "error").length,
      },
    });
  }

  return jsonOk({
    dryRun,
    total: rows.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  });
});
