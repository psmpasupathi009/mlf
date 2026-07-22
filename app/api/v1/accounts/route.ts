import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiHandler, jsonFail, jsonOk, parsePagination } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";
import { nextUnitId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { createPaymentSchema } from "@/lib/validations/accounts.schema";
import { toPaymentSummary } from "@/features/accounts/server/serialize";

export const GET = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "accounts", "view");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const { page, pageSize, skip } = parsePagination(searchParams);
  const clientUnitId = searchParams.get("clientUnitId")?.trim();
  const caseUnitId = searchParams.get("caseUnitId")?.trim();
  const status = searchParams.get("status")?.trim();
  const type = searchParams.get("type")?.trim();

  const where: Prisma.CashPaymentWhereInput = {
    ...(clientUnitId ? { clientUnitId } : {}),
    ...(caseUnitId ? { caseUnitId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(type ? { type: type as never } : {}),
  };

  const [rows, total, totals] = await Promise.all([
    prisma.cashPayment.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
    prisma.cashPayment.count({ where }),
    prisma.cashPayment.groupBy({ by: ["status"], where, _sum: { amount: true } }),
  ]);

  const clientIds = Array.from(new Set(rows.map((r) => r.clientUnitId)));
  const clients = await prisma.client.findMany({
    where: { unitId: { in: clientIds } },
    select: { unitId: true, name: true },
  });
  const clientMap = new Map(clients.map((c) => [c.unitId, c.name]));

  const data = rows.map((r) => ({ ...toPaymentSummary(r), clientName: clientMap.get(r.clientUnitId) ?? null }));

  const summary = {
    paid: totals.find((t) => t.status === "paid")?._sum.amount ?? 0,
    pending: totals.find((t) => t.status === "pending")?._sum.amount ?? 0,
    void: totals.find((t) => t.status === "void")?._sum.amount ?? 0,
  };

  return NextResponse.json({ ok: true, data, meta: { page, pageSize, total }, summary });
});

export const POST = apiHandler(async (request) => {
  const { user, response } = await requirePerm(request, "accounts", "create");
  if (!user) return response;

  const raw = await request.json();
  const parsed = createPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonFail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
  }
  const input = parsed.data;

  const client = await prisma.client.findUnique({ where: { unitId: input.clientUnitId } });
  if (!client) return jsonFail("VALIDATION", "Client not found", 400);

  let caseId: string | undefined;
  if (input.caseUnitId) {
    const caseItem = await prisma.case.findUnique({ where: { unitId: input.caseUnitId } });
    if (!caseItem) return jsonFail("VALIDATION", "Case not found", 400);
    caseId = caseItem.id;
  }

  const unitId = await nextUnitId("payment");
  const created = await prisma.cashPayment.create({
    data: {
      unitId,
      clientId: client.id,
      clientUnitId: client.unitId,
      caseId,
      caseUnitId: input.caseUnitId || undefined,
      type: input.type,
      amount: input.amount,
      status: input.status ?? "pending",
      paidOn: input.paidOn,
      notes: input.notes || undefined,
      createdById: user.id,
    },
  });

  await writeAudit({
    actorUnitId: user.unitId,
    action: "payment.create",
    entity: "CashPayment",
    entityUnitId: created.unitId,
    meta: { amount: created.amount, type: created.type },
  });

  return jsonOk({ payment: toPaymentSummary(created) }, 201);
});
