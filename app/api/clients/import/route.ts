import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { importClientsSchema } from "@/lib/validations/clients.schema";
import { compliance } from "@/config/company/compliance";
import { assertImportRateLimit } from "@/lib/rate-limit/guards";
import {
  findClientByMobile,
  findClientByUnitId,
} from "@/lib/imports/lookups";
import {
  findIgnoredImportColumns,
  IMPORT_CLIENT_COLUMNS,
} from "@/lib/imports/columns";

type RowResult = { row: number; unitId: string | null; status: "ok" | "error"; message: string };

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "clients", "create");
  if (!user) return response;

  const limited = await assertImportRateLimit(request, user.unitId);
  if (limited) return limited;
  const canEdit = await hasPermission(user.id, "clients", "edit");

  const raw = await request.json();
  const ignoredColumns = Array.isArray(raw?.rows)
    ? findIgnoredImportColumns(raw.rows as Record<string, string>[], IMPORT_CLIENT_COLUMNS)
    : [];
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
        ? await findClientByUnitId(row.unitId)
        : null;
      const existingByMobile = await findClientByMobile(mobile);

      if (row.unitId?.trim() && !existingByUnitId) {
        results.push({
          row: rowNum,
          unitId: row.unitId,
          status: "error",
          message: "Client unitId not found (remove unitId to create a new client)",
        });
        continue;
      }

      if (existingByUnitId && existingByUnitId.mobile !== mobile && existingByMobile) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error",
          message: "Mobile already used by another client",
        });
        continue;
      }

      if (!existingByUnitId && existingByMobile) {
        results.push({
          row: rowNum,
          unitId: existingByMobile.unitId,
          status: "error",
          message: "Mobile already registered (set unitId to update that client)",
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
            mobile,
          },
        });
        results.push({ row: rowNum, unitId: updated.unitId, status: "ok", message: "Updated" });
      } else {
        const unitId = await nextUnitId("client");
        const created = await prisma.client.create({
          data: {
            unitId,
            name: row.name,
            mobile,
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
    ignoredColumns,
  });
});
