import { apiHandler, jsonOk } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { unreadNotificationWhere } from "@/lib/notifications/notify";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const unread = await prisma.notification.count({
    where: { userId: user.id, ...unreadNotificationWhere },
  });

  return jsonOk({ unread });
});
