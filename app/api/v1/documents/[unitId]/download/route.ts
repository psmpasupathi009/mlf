import { NextResponse } from "next/server";
import { apiHandler, jsonFail } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";

export const GET = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "cases", "view");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const doc = unitId ? await prisma.document.findUnique({ where: { unitId } }) : null;
  if (!doc) return jsonFail("NOT_FOUND", "Document not found", 404);

  const file = await storage.get(doc.fileKey);
  if (!file) return jsonFail("NOT_FOUND", "File not found in storage", 404);

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.originalName)}"`,
      "Content-Length": String(doc.size),
    },
  });
});
