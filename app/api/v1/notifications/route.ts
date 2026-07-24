import { apiHandler, jsonOk, jsonOkList, parsePagination } from "@/lib/api/response";
import { requireUser } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { toNotificationPayload } from "@/lib/notifications/notify";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip } = parsePagination(searchParams);
  const unreadOnly = searchParams.get("unread") === "1";

  const where = {
    userId: user.id,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
  ]);

  return jsonOkList(
    rows.map(toNotificationPayload),
    { page, pageSize, total }
  );
});
