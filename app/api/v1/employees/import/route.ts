import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { designationDefaultRoles, normalizeDesignation } from "@/config/company/designations";
import { importEmployeesSchema } from "@/lib/validations/employees.schema";
import { compliance } from "@/config/company/compliance";

type RowResult = {
  row: number;
  unitId: string | null;
  status: "ok" | "error";
  message: string;
};

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "employees", "create");
  if (!user) return response;
  const canEdit = await hasPermission(user.id, "employees", "edit");

  const raw = await request.json();
  const parsed = importEmployeesSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const { dryRun, rows } = parsed.data;

  if (rows.length > compliance.csv.maxRows) {
    return jsonFail("VALIDATION", `Max ${compliance.csv.maxRows} rows per import`, 400);
  }

  const results: RowResult[] = [];
  const seenMobiles = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2; // header is row 1

    const mobile = normalizeMobile(row.mobile);
    if (!mobile) {
      results.push({ row: rowNum, unitId: row.unitId || null, status: "error", message: "Invalid mobile number" });
      continue;
    }

    if (seenMobiles.has(mobile)) {
      results.push({ row: rowNum, unitId: row.unitId || null, status: "error", message: "Duplicate mobile in file" });
      continue;
    }
    seenMobiles.add(mobile);

    const designation = normalizeDesignation(row.designation);
    if (!designation) {
      results.push({
        row: rowNum,
        unitId: row.unitId || null,
        status: "error",
        message: "Select a designation",
      });
      continue;
    }
    const roles = designationDefaultRoles[designation];

    try {
      const existingByMobile = await prisma.user.findUnique({ where: { mobile } });
      const existingByUnitId = row.unitId
        ? await prisma.user.findUnique({ where: { unitId: row.unitId } })
        : null;

      if (existingByUnitId && existingByUnitId.mobile !== mobile && existingByMobile) {
        results.push({ row: rowNum, unitId: row.unitId || null, status: "error", message: "Mobile already used by another employee" });
        continue;
      }

      if (!existingByUnitId && existingByMobile) {
        results.push({ row: rowNum, unitId: existingByMobile.unitId, status: "error", message: "Mobile already registered" });
        continue;
      }

      if (row.unitId?.trim() && !existingByUnitId) {
        results.push({
          row: rowNum,
          unitId: row.unitId,
          status: "error",
          message: "Employee unitId not found (remove unitId to create a new employee)",
        });
        continue;
      }

      if (existingByUnitId && !canEdit) {
        results.push({
          row: rowNum,
          unitId: existingByUnitId.unitId,
          status: "error",
          message: "Updating existing employees requires employees.edit",
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
        const updated = await prisma.user.update({
          where: { id: existingByUnitId.id },
          data: {
            name: row.name,
            designation,
            roles,
            mobile,
            email: row.email || undefined,
            address: row.address || undefined,
          },
        });
        results.push({ row: rowNum, unitId: updated.unitId, status: "ok", message: "Updated" });
      } else {
        const unitId = await nextUnitId("employee");
        const created = await prisma.user.create({
          data: {
            unitId,
            mobile,
            name: row.name,
            designation,
            roles,
            email: row.email || undefined,
            address: row.address || undefined,
            createdById: user.id,
            isActive: true,
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
      action: "employee.import",
      entity: "User",
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
