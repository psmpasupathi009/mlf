import { createImportHandler } from "@/lib/imports/run-import";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { normalizeMobile } from "@/lib/auth/mobile";
import {
  designationDefaultRoles,
  normalizeDesignation,
} from "@/config/company/designations";
import { importEmployeesSchema } from "@/lib/validations/employees.schema";
import { findUserByUnitId } from "@/lib/imports/lookups";
import { IMPORT_EMPLOYEE_COLUMNS } from "@/lib/imports/columns";

export const POST = createImportHandler({
  perm: ["employees", "create"],
  editPerm: ["employees", "edit"],
  schema: importEmployeesSchema,
  columns: IMPORT_EMPLOYEE_COLUMNS,
  audit: { action: "employee.import", entity: "User" },
  async processRows(rows, { user, dryRun, canEdit }) {
    const results = [];
    const seenMobiles = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2;

      const mobile = normalizeMobile(row.mobile);
      if (!mobile) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error" as const,
          message: "Invalid mobile number",
        });
        continue;
      }

      if (seenMobiles.has(mobile)) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error" as const,
          message: "Duplicate mobile in file",
        });
        continue;
      }
      seenMobiles.add(mobile);

      const designation = normalizeDesignation(row.designation);
      if (!designation) {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error" as const,
          message: "Select a designation",
        });
        continue;
      }
      const baseRoles = designationDefaultRoles[designation];

      try {
        const existingByMobile = await prisma.user.findUnique({
          where: { mobile },
          select: { id: true, unitId: true, mobile: true, roles: true },
        });
        const existingByUnitId = row.unitId
          ? await findUserByUnitId(row.unitId)
          : null;

        if (
          existingByUnitId &&
          existingByUnitId.unitId !== existingByMobile?.unitId &&
          existingByMobile
        ) {
          results.push({
            row: rowNum,
            unitId: row.unitId || null,
            status: "error" as const,
            message: "Mobile already used by another employee",
          });
          continue;
        }

        if (!existingByUnitId && existingByMobile) {
          results.push({
            row: rowNum,
            unitId: existingByMobile.unitId,
            status: "error" as const,
            message: "Mobile already registered",
          });
          continue;
        }

        if (row.unitId?.trim() && !existingByUnitId) {
          results.push({
            row: rowNum,
            unitId: row.unitId,
            status: "error" as const,
            message:
              "Employee unitId not found (remove unitId to create a new employee)",
          });
          continue;
        }

        if (existingByUnitId && !canEdit) {
          results.push({
            row: rowNum,
            unitId: existingByUnitId.unitId,
            status: "error" as const,
            message: "Updating existing employees requires employees.edit",
          });
          continue;
        }

        const preserved = (existingByUnitId?.roles ?? []).filter(
          (r) => r === "admin" || r === "sub_admin"
        );
        const roles = Array.from(new Set([...preserved, ...baseRoles]));

        if (dryRun) {
          results.push({
            row: rowNum,
            unitId: row.unitId || null,
            status: "ok" as const,
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
            },
          });
          results.push({
            row: rowNum,
            unitId: updated.unitId,
            status: "ok" as const,
            message: "Updated",
          });
        } else {
          const unitId = await nextUnitId("employee");
          const created = await prisma.user.create({
            data: {
              unitId,
              mobile,
              name: row.name,
              designation,
              roles,
              createdById: user.id,
              isActive: true,
            },
          });
          results.push({
            row: rowNum,
            unitId: created.unitId,
            status: "ok" as const,
            message: "Created",
          });
        }
      } catch {
        results.push({
          row: rowNum,
          unitId: row.unitId || null,
          status: "error" as const,
          message: "Failed to save row",
        });
      }
    }

    return results;
  },
});
