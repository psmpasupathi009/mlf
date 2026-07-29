import { apiHandler, jsonOk } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";

export const POST = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return jsonOk({ updated: result.count });
});
