import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import {
  disableClientPortalLogin,
  enableClientPortalLogin,
  getClientPortalLoginStatus,
} from "@/features/clients/server/portal-login";
import { ensureDefaultPermissions } from "@/lib/rbac";

/** Enable client portal login (creates User with CLI id if missing). */
export const POST = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "clients", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  if (!unitId) return jsonFail("VALIDATION", "Missing client id", 400);

  const client = await prisma.client.findUnique({ where: { unitId } });
  if (!client) return jsonFail("NOT_FOUND", "Client not found", 404);

  const mobile = normalizeMobile(client.mobile);
  if (!mobile) {
    return jsonFail(
      "VALIDATION",
      "Client mobile is invalid — update the client record first",
      400
    );
  }

  await ensureDefaultPermissions();

  const before = await getClientPortalLoginStatus(client.unitId);

  try {
    const portalUser = await enableClientPortalLogin(client, {
      createdById: user.id,
    });

    await writeAudit({
      actorUnitId: user.unitId,
      action: before.hasLoginAccount
        ? "client.portal.reactivate"
        : "client.portal.enable",
      entity: "Client",
      entityUnitId: client.unitId,
      meta: { userUnitId: portalUser.unitId },
    });

    const status = before.hasLoginAccount ? 200 : 201;
    return jsonOk(
      {
        portal: await getClientPortalLoginStatus(client.unitId),
        message: portalUser.pinHash
          ? "Portal enabled. Client can sign in with mobile and PIN."
          : "Portal enabled. Client signs in with this mobile, verifies OTP, and sets a PIN.",
      },
      status
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not enable portal";
    if (message.includes("staff login") || message.includes("another client")) {
      return jsonFail("CONFLICT", message, 409);
    }
    return jsonFail("SERVER_ERROR", message, 500);
  }
});

/** Disable client portal login (keeps User row; blocks sign-in). */
export const DELETE = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "clients", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  if (!unitId) return jsonFail("VALIDATION", "Missing client id", 400);

  const client = await prisma.client.findUnique({ where: { unitId } });
  if (!client) return jsonFail("NOT_FOUND", "Client not found", 404);

  try {
    const portalUser = await disableClientPortalLogin(client.unitId);

    await writeAudit({
      actorUnitId: user.unitId,
      action: "client.portal.disable",
      entity: "Client",
      entityUnitId: client.unitId,
      meta: { userUnitId: portalUser.unitId },
    });

    return jsonOk({
      portal: await getClientPortalLoginStatus(client.unitId),
      message: "Portal disabled. Client cannot sign in until re-enabled.",
    });
  } catch {
    return jsonFail("NOT_FOUND", "No portal login for this client", 404);
  }
});

/** Portal login status for staff UI. */
export const GET = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "clients", "view");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  if (!unitId) return jsonFail("VALIDATION", "Missing client id", 400);

  const client = await prisma.client.findUnique({
    where: { unitId },
    select: { unitId: true },
  });
  if (!client) return jsonFail("NOT_FOUND", "Client not found", 404);

  return jsonOk({ portal: await getClientPortalLoginStatus(client.unitId) });
});
