import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { apiHandler, jsonFail } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db/prisma";
import {
  buildAccountsWhere,
  parseAccountsFilters,
} from "@/features/accounts/server/filters";
import { resolveActorsByIds } from "@/features/accounts/server/actors";
import { FEE_PURPOSES } from "@/features/accounts/lib/payment-purposes";

export const GET = apiHandler(async (request) => {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "cases";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MLF";

  if (type === "cases") {
    const { user, response } = await requirePerm(request, "cases", "view");
    if (!user) return response;
    const rows = await prisma.case.findMany({
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const sheet = workbook.addWorksheet("Cases");
    sheet.columns = [
      { header: "unitId", key: "unitId", width: 14 },
      { header: "caseNumber", key: "caseNumber", width: 18 },
      { header: "clientUnitId", key: "clientUnitId", width: 14 },
      { header: "status", key: "status", width: 12 },
      { header: "opposingParty", key: "opposingParty", width: 24 },
      { header: "courtName", key: "courtName", width: 24 },
      { header: "nextHearingAt", key: "nextHearingAt", width: 20 },
    ];
    for (const r of rows) {
      sheet.addRow({
        unitId: r.unitId,
        caseNumber: r.caseNumber ?? "",
        clientUnitId: r.clientUnitId,
        status: r.status,
        opposingParty: r.opposingParty ?? "",
        courtName: r.courtName ?? "",
        nextHearingAt: r.nextHearingAt?.toISOString() ?? "",
      });
    }
  } else if (type === "accounts") {
    const { user, response } = await requirePerm(request, "accounts", "view");
    if (!user) return response;

    const filters = parseAccountsFilters(url.searchParams);
    let matchingClientUnitIds: string[] | undefined;
    if (filters.q) {
      const clients = await prisma.client.findMany({
        where: { name: { contains: filters.q } },
        select: { unitId: true },
        take: 100,
      });
      matchingClientUnitIds = clients.map((c) => c.unitId);
    }
    const where = buildAccountsWhere({ ...filters, matchingClientUnitIds });

    const rows = await prisma.cashPayment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const clientIds = Array.from(new Set(rows.map((r) => r.clientUnitId)));
    const [clients, actorMap] = await Promise.all([
      prisma.client.findMany({
        where: { unitId: { in: clientIds } },
        select: { unitId: true, name: true },
      }),
      resolveActorsByIds(rows.flatMap((r) => [r.createdById, r.voidedById])),
    ]);
    const clientMap = new Map(clients.map((c) => [c.unitId, c.name]));

    const sheet = workbook.addWorksheet("Payments");
    sheet.columns = [
      { header: "unitId", key: "unitId", width: 14 },
      { header: "clientUnitId", key: "clientUnitId", width: 14 },
      { header: "clientName", key: "clientName", width: 24 },
      { header: "caseUnitId", key: "caseUnitId", width: 14 },
      { header: "purpose", key: "purpose", width: 14 },
      { header: "amount", key: "amount", width: 12 },
      { header: "status", key: "status", width: 12 },
      { header: "paidOn", key: "paidOn", width: 20 },
      { header: "notes", key: "notes", width: 32 },
      { header: "voidedAt", key: "voidedAt", width: 20 },
      { header: "voidReason", key: "voidReason", width: 28 },
      { header: "createdAt", key: "createdAt", width: 20 },
      { header: "createdByUnitId", key: "createdByUnitId", width: 14 },
      { header: "voidedByUnitId", key: "voidedByUnitId", width: 14 },
    ];
    for (const r of rows) {
      sheet.addRow({
        unitId: r.unitId,
        clientUnitId: r.clientUnitId,
        clientName: clientMap.get(r.clientUnitId) ?? "",
        caseUnitId: r.caseUnitId ?? "",
        purpose: r.type,
        amount: r.amount,
        status: r.status,
        paidOn: r.paidOn?.toISOString() ?? "",
        notes: r.notes ?? "",
        voidedAt: r.voidedAt?.toISOString() ?? "",
        voidReason: r.voidReason ?? "",
        createdAt: r.createdAt.toISOString(),
        createdByUnitId: r.createdById
          ? actorMap.get(r.createdById)?.unitId ?? ""
          : "",
        voidedByUnitId: r.voidedById
          ? actorMap.get(r.voidedById)?.unitId ?? ""
          : "",
      });
    }
  } else if (type === "fees-outstanding") {
    const { user, response } = await requirePerm(request, "accounts", "view");
    if (!user) return response;
    const canReports = await hasPermission(user.id, "reports", "view");
    if (!canReports) {
      return jsonFail("FORBIDDEN", "Reports permission required", 403);
    }

    const cases = await prisma.case.findMany({
      where: { agreedFee: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 5000,
      select: {
        unitId: true,
        caseNumber: true,
        clientUnitId: true,
        status: true,
        courtName: true,
        agreedFee: true,
      },
    });

    const caseUnitIds = cases.map((c) => c.unitId);
    const paidRows = caseUnitIds.length
      ? await prisma.cashPayment.groupBy({
          by: ["caseUnitId"],
          where: {
            caseUnitId: { in: caseUnitIds },
            status: "paid",
            type: { in: [...FEE_PURPOSES] },
          },
          _sum: { amount: true },
        })
      : [];
    const collectedMap = new Map(
      paidRows
        .filter((r) => r.caseUnitId)
        .map((r) => [r.caseUnitId as string, r._sum.amount ?? 0])
    );

    const clientIds = Array.from(new Set(cases.map((c) => c.clientUnitId)));
    const clients = await prisma.client.findMany({
      where: { unitId: { in: clientIds } },
      select: { unitId: true, name: true },
    });
    const clientMap = new Map(clients.map((c) => [c.unitId, c.name]));

    const sheet = workbook.addWorksheet("Fees outstanding");
    sheet.columns = [
      { header: "caseUnitId", key: "caseUnitId", width: 14 },
      { header: "caseNumber", key: "caseNumber", width: 18 },
      { header: "clientUnitId", key: "clientUnitId", width: 14 },
      { header: "clientName", key: "clientName", width: 24 },
      { header: "status", key: "status", width: 14 },
      { header: "courtName", key: "courtName", width: 24 },
      { header: "agreedFee", key: "agreedFee", width: 12 },
      { header: "collected", key: "collected", width: 12 },
      { header: "outstanding", key: "outstanding", width: 12 },
    ];
    for (const c of cases) {
      const agreed = c.agreedFee ?? 0;
      const collected = collectedMap.get(c.unitId) ?? 0;
      const outstanding = Math.max(0, agreed - collected);
      sheet.addRow({
        caseUnitId: c.unitId,
        caseNumber: c.caseNumber ?? "",
        clientUnitId: c.clientUnitId,
        clientName: clientMap.get(c.clientUnitId) ?? "",
        status: c.status,
        courtName: c.courtName ?? "",
        agreedFee: agreed,
        collected,
        outstanding,
      });
    }
  } else {
    return jsonFail("VALIDATION", "Unknown export type", 400);
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mlf-${type}.xlsx"`,
    },
  });
});
