import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { hasPermission, requireModuleEnabled } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit, pickAuditFields, diffAudit } from "@/lib/audit";
import { displayMobile } from "@/lib/auth/mobile";
import { canBookForAnyAdvocate } from "@/lib/appointments/booking-rules";
import { enrichAppointment } from "@/features/appointments/server/enrich";
import { toCaseSummary } from "@/features/cases/server/serialize";

/**
 * Convert a consultation appointment into an enquiry case and link them.
 * Allowed with appointments.edit or cases.create.
 */
export const POST = apiHandler(async (request, context) => {
  const casesMod = requireModuleEnabled("cases");
  if (casesMod) return casesMod;
  const apptsMod = requireModuleEnabled("appointments");
  if (apptsMod) return apptsMod;

  const { user, response } = await requireUser(request);
  if (!user) return response;

  const canEditApt = await hasPermission(user.id, "appointments", "edit");
  const canCreateCase = await hasPermission(user.id, "cases", "create");
  if (!canEditApt && !canCreateCase) {
    return jsonFail("FORBIDDEN", "You don’t have access. Ask admin.", 403);
  }

  const { unitId } = (await context.params) ?? {};
  const item = unitId
    ? await prisma.appointment.findUnique({ where: { unitId } })
    : null;
  if (!item) return jsonFail("NOT_FOUND", "Appointment not found", 404);

  if (!canBookForAnyAdvocate(user.roles)) {
    const ten = user.mobile.replace(/\D/g, "").slice(-10);
    const aptTen = (item.advocateMobile ?? "").replace(/\D/g, "").slice(-10);
    if (aptTen && aptTen !== ten) {
      return jsonFail("FORBIDDEN", "You don’t have access. Ask admin.", 403);
    }
  }

  if (item.caseUnitId) {
    return jsonFail(
      "CONFLICT",
      "This appointment is already linked to a case",
      409
    );
  }

  if (!item.clientUnitId) {
    return jsonFail(
      "VALIDATION",
      "Link a client before opening a case",
      400
    );
  }

  const client = await prisma.client.findUnique({
    where: { unitId: item.clientUnitId },
  });
  if (!client) {
    return jsonFail("VALIDATION", "Client not found", 400);
  }

  const advocateMobile = item.advocateMobile
    ? displayMobile(item.advocateMobile) || item.advocateMobile
    : undefined;

  const noteParts = [
    item.title ? `Consultation: ${item.title}` : null,
    item.notes?.trim() || null,
  ].filter(Boolean);

  const aptBefore = pickAuditFields(item as Record<string, unknown>, [
    "caseUnitId",
    "clientUnitId",
    "title",
  ] as const);

  const caseUnitId = await nextUnitId("case");
  const created = await prisma.case.create({
    data: {
      unitId: caseUnitId,
      clientId: client.id,
      clientUnitId: client.unitId,
      status: "enquiry",
      primaryAdvocateMobile: advocateMobile || undefined,
      advocateMobiles: advocateMobile ? [advocateMobile] : [],
      notes: noteParts.length ? noteParts.join("\n") : undefined,
      createdById: user.id,
    },
  });

  const updated = await prisma.appointment.update({
    where: { id: item.id },
    data: {
      caseId: created.id,
      caseUnitId: created.unitId,
    },
  });

  const aptAfter = pickAuditFields(updated as Record<string, unknown>, [
    "caseUnitId",
    "clientUnitId",
    "title",
  ] as const);
  await writeAudit({
    actorUnitId: user.unitId,
    action: "appointment.convert_case",
    entity: "Appointment",
    entityUnitId: updated.unitId,
    meta: {
      before: aptBefore,
      after: aptAfter,
      changes: diffAudit(aptBefore, aptAfter),
      caseUnitId: created.unitId,
      case: pickAuditFields(created as Record<string, unknown>, [
        "clientUnitId",
        "status",
        "primaryAdvocateMobile",
        "advocateMobiles",
        "notes",
      ] as const),
    },
  });

  return jsonOk({
    case: toCaseSummary(created),
    appointment: await enrichAppointment(updated),
  });
});
