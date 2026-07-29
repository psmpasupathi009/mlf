import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import { writeAudit, pickAuditFields } from "@/lib/audit";
import { storage } from "@/lib/storage";

export const DELETE = apiHandler(async (request, context) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const doc = unitId
    ? await prisma.document.findUnique({ where: { unitId } })
    : null;
  if (!doc) return jsonFail("NOT_FOUND", "Document not found", 404);

  const canCasesUpload = await hasPermission(user.id, "cases", "upload");
  const canAccountsReceipt =
    doc.docType === "receipt" &&
    ((await hasPermission(user.id, "accounts", "edit")) ||
      (await hasPermission(user.id, "accounts", "upload")));

  if (!canCasesUpload && !canAccountsReceipt) {
    return jsonFail("FORBIDDEN", "You don’t have access. Ask admin.", 403);
  }

  await storage.delete(doc.fileKey);
  await prisma.document.delete({ where: { id: doc.id } });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "document.delete",
    entity: "Document",
    entityUnitId: doc.unitId,
    meta: {
      before: pickAuditFields(doc as Record<string, unknown>, [
        "title",
        "docType",
        "notes",
        "caseUnitId",
        "clientUnitId",
        "mimeType",
        "size",
        "originalName",
      ] as const),
    },
  });

  return jsonOk({ deleted: true, unitId: doc.unitId });
});
