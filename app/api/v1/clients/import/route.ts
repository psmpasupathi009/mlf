import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { importClientsSchema } from "@/lib/validations/clients.schema";
import { compliance } from "@/config/company/compliance";

type RowResult = { row: number; unitId: string | null; status: "ok" | "error"; message: string };

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "clients", "create");
  if (!user) return response;
  const canEdit = await hasPermission(user.id, "clients", "edit");

  const raw = await request.json();
  const parsed = importClientsSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const { dryRun, rows } = parsed.data;

  if (rows.length > compliance.csv.maxRows) {
    return jsonFail("VALIDATION", `Max ${compliance.csv.maxRows} rows per import`, 400);
  }

  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    const mobile = normalizeMobile(row.mobile);
    if (!mobile) {
      results.push({ row: rowNum, unitId: row.unitId || null, status: "error", message: "Invalid mobile number" });
      continue;
    }

    try {
      const existingByUnitId = row.unitId
        ? await prisma.client.findUnique({ where: { unitId: row.unitId } })
        : null;

      if (row.unitId?.trim() && !existingByUnitId) {
        results.push({
          row: rowNum,
          unitId: row.unitId,
          status: "error",
          message: "Client unitId not found (remove unitId to create a new client)",
        });
        continue;
      }

      if (existingByUnitId && !canEdit) {
        results.push({
          row: rowNum,
          unitId: existingByUnitId.unitId,
          status: "error",
          message: "Updating existing clients requires clients.edit",
        });
        continue;
      }

      if (dryRun) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "ok",
          message: existingByUnitId ? "Will update" : "Will create",
        });
        continue;
      }

      if (existingByUnitId) {
        const updated = await prisma.client.update({
          where: { id: existingByUnitId.id },
          data: {
            name: row.name,
            fatherOrSpouse: row.fatherOrSpouse || undefined,
            occupation: row.occupation || undefined,
            gender: row.gender || undefined,
            mobile,
            altMobile: row.altMobile ? normalizeMobile(row.altMobile) ?? row.altMobile : undefined,
            email: row.email || undefined,
            address: row.address || undefined,
            city: row.city || undefined,
            district: row.district || undefined,
            state: row.state || undefined,
            aadhaarLast4: row.aadhaarLast4 || undefined,
            referredBy: row.referredBy || undefined,
            matterBrief: row.matterBrief || undefined,
            notes: row.notes || undefined,
            smsConsent:
              row.smsConsent === "" || row.smsConsent == null
                ? undefined
                : !["false", "0", "no"].includes(String(row.smsConsent).toLowerCase()),
          },
        });
        results.push({ row: rowNum, unitId: updated.unitId, status: "ok", message: "Updated" });
      } else {
        const unitId = await nextUnitId("client");
        const created = await prisma.client.create({
          data: {
            unitId,
            name: row.name,
            fatherOrSpouse: row.fatherOrSpouse || undefined,
            occupation: row.occupation || undefined,
            gender: row.gender || undefined,
            mobile,
            altMobile: row.altMobile ? normalizeMobile(row.altMobile) ?? row.altMobile : undefined,
            email: row.email || undefined,
            address: row.address || undefined,
            city: row.city || undefined,
            district: row.district || undefined,
            state: row.state || undefined,
            aadhaarLast4: row.aadhaarLast4 || undefined,
            referredBy: row.referredBy || undefined,
            matterBrief: row.matterBrief || undefined,
            notes: row.notes || undefined,
            smsConsent: !["false", "0", "no"].includes(
              String(row.smsConsent || "true").toLowerCase()
            ),
            createdById: user.id,
          },
        });
        results.push({ row: rowNum, unitId: created.unitId, status: "ok", message: "Created" });
      }
    } catch {
      results.push({ row: rowNum, unitId: row.unitId || null, status: "error", message: "Failed to save row" });
    }
  }

  if (!dryRun) {
    await writeAudit({
      actorUnitId: user.unitId,
      action: "client.import",
      entity: "Client",
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
