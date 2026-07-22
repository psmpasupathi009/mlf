import { apiHandler, jsonFail, jsonOk } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit";
import { normalizeMobile } from "@/lib/auth/mobile";
import { updateClientSchema } from "@/lib/validations/clients.schema";
import { toClientSummary } from "@/features/clients/server/serialize";

export const GET = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "clients", "view");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const client = unitId ? await prisma.client.findUnique({ where: { unitId } }) : null;
  if (!client) return jsonFail("NOT_FOUND", "Client not found", 404);

  const cases = await prisma.case.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    select: { unitId: true, caseNumber: true, courtName: true, status: true, nextHearingAt: true },
  });

  return jsonOk({ client: toClientSummary(client), cases });
});

export const PATCH = apiHandler(async (request, context) => {
  const { user, response } = await requirePerm(request, "clients", "edit");
  if (!user) return response;

  const { unitId } = (await context.params) ?? {};
  const client = unitId ? await prisma.client.findUnique({ where: { unitId } }) : null;
  if (!client) return jsonFail("NOT_FOUND", "Client not found", 404);

  const raw = await request.json();
  const parsed = updateClientSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  const updated = await prisma.client.update({
    where: { id: client.id },
    data: {
      name: input.name,
      fatherOrSpouse:
        input.fatherOrSpouse === ""
          ? null
          : input.fatherOrSpouse !== undefined
            ? input.fatherOrSpouse
            : undefined,
      occupation:
        input.occupation === ""
          ? null
          : input.occupation !== undefined
            ? input.occupation
            : undefined,
      gender:
        input.gender === ""
          ? null
          : input.gender !== undefined
            ? input.gender
            : undefined,
      mobile: input.mobile ? normalizeMobile(input.mobile) ?? client.mobile : undefined,
      altMobile:
        input.altMobile === ""
          ? null
          : input.altMobile
            ? normalizeMobile(input.altMobile) ?? input.altMobile
            : undefined,
      email: input.email === "" ? null : input.email,
      address: input.address === "" ? null : input.address,
      city: input.city === "" ? null : input.city,
      district: input.district === "" ? null : input.district,
      state: input.state === "" ? null : input.state,
      aadhaarLast4: input.aadhaarLast4 === "" ? null : input.aadhaarLast4,
      referredBy:
        input.referredBy === ""
          ? null
          : input.referredBy !== undefined
            ? input.referredBy
            : undefined,
      matterBrief:
        input.matterBrief === ""
          ? null
          : input.matterBrief !== undefined
            ? input.matterBrief
            : undefined,
      notes: input.notes === "" ? null : input.notes,
      smsConsent: input.smsConsent,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "client.update",
    entity: "Client",
    entityUnitId: updated.unitId,
  });

  return jsonOk({ client: toClientSummary(updated) });
});
