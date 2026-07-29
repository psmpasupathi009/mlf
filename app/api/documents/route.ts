import { apiHandler, jsonFail, jsonOk, jsonOkList, parsePagination } from "@/lib/api/response";
import { requirePerm, requireUser } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { isModuleEnabled } from "@/config/company/modules";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit, pickAuditFields } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { documentUploadMetaSchema } from "@/lib/validations/documents.schema";
import { toDocumentSummary } from "@/features/documents/server/serialize";
import { rateLimit } from "@/lib/rate-limit";
import { clientRateKey } from "@/lib/rate-limit/client-key";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "cases", "view");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip } = parsePagination(searchParams);
  const caseUnitId = searchParams.get("caseUnitId")?.trim();
  const clientUnitId = searchParams.get("clientUnitId")?.trim();

  if (!caseUnitId && !clientUnitId) {
    return jsonFail(
      "VALIDATION",
      "Provide caseUnitId or clientUnitId to list documents",
      400
    );
  }

  const where = {
    ...(caseUnitId ? { caseUnitId } : {}),
    ...(clientUnitId ? { clientUnitId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.document.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
    prisma.document.count({ where }),
  ]);

  return jsonOkList(rows.map(toDocumentSummary), { page, pageSize, total });
});

export const POST = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const limited = await rateLimit(
    clientRateKey(request, "upload", user.unitId),
    30,
    15 * 60 * 1000
  );
  if (!limited.allowed) {
    return jsonFail(
      "RATE_LIMITED",
      "Too many uploads. Try again in a few minutes.",
      429
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonFail("VALIDATION", "A file is required", 400);
  }

  const parsed = documentUploadMetaSchema.safeParse({
    title: form.get("title")?.toString() ?? file.name,
    docType: form.get("docType")?.toString() || "other",
    notes: form.get("notes")?.toString() ?? "",
    caseUnitId: form.get("caseUnitId")?.toString() ?? "",
    clientUnitId: form.get("clientUnitId")?.toString() ?? "",
  });
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  // Case docs need cases.upload; fee receipts also allowed with accounts.edit/upload.
  const canCasesUpload =
    isModuleEnabled("cases") &&
    (await hasPermission(user.id, "cases", "upload"));
  const canAccountsReceipt =
    input.docType === "receipt" &&
    isModuleEnabled("accounts") &&
    ((await hasPermission(user.id, "accounts", "edit")) ||
      (await hasPermission(user.id, "accounts", "upload")));
  if (!canCasesUpload && !canAccountsReceipt) {
    return jsonFail("FORBIDDEN", "You don’t have access. Ask admin.", 403);
  }

  let caseId: string | undefined;
  if (input.caseUnitId) {
    const caseItem = await prisma.case.findUnique({ where: { unitId: input.caseUnitId } });
    if (!caseItem) return jsonFail("VALIDATION", "Case not found", 400);
    caseId = caseItem.id;
  }

  let clientId: string | undefined;
  if (input.clientUnitId) {
    const client = await prisma.client.findUnique({ where: { unitId: input.clientUnitId } });
    if (!client) return jsonFail("VALIDATION", "Client not found", 400);
    clientId = client.id;
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let stored;
  try {
    stored = await storage.put({
      buffer,
      mimeType: file.type || "application/octet-stream",
      originalName: file.name,
      folder: input.caseUnitId || input.clientUnitId || "misc",
    });
  } catch (error) {
    return jsonFail("VALIDATION", error instanceof Error ? error.message : "Upload failed", 400);
  }

  const unitId = await nextUnitId("document");
  const created = await prisma.document.create({
    data: {
      unitId,
      title: input.title,
      docType: input.docType,
      notes: input.notes || undefined,
      caseId,
      caseUnitId: input.caseUnitId || undefined,
      clientId,
      clientUnitId: input.clientUnitId || undefined,
      fileKey: stored.key,
      mimeType: stored.mimeType,
      size: stored.size,
      originalName: stored.originalName,
      uploadedById: user.id,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "document.upload",
    entity: "Document",
    entityUnitId: created.unitId,
    meta: {
      after: pickAuditFields(created as Record<string, unknown>, [
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

  return jsonOk({ document: toDocumentSummary(created) }, 201);
});
