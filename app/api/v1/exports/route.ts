import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { apiHandler, jsonFail } from "@/lib/api/response";
import { requirePerm } from "@/lib/api/guard";
import { prisma } from "@/lib/db/prisma";

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
    const rows = await prisma.cashPayment.findMany({
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const sheet = workbook.addWorksheet("Payments");
    sheet.columns = [
      { header: "unitId", key: "unitId", width: 14 },
      { header: "clientUnitId", key: "clientUnitId", width: 14 },
      { header: "caseUnitId", key: "caseUnitId", width: 14 },
      { header: "type", key: "type", width: 12 },
      { header: "amount", key: "amount", width: 12 },
      { header: "status", key: "status", width: 12 },
      { header: "paidOn", key: "paidOn", width: 20 },
    ];
    for (const r of rows) {
      sheet.addRow({
        unitId: r.unitId,
        clientUnitId: r.clientUnitId,
        caseUnitId: r.caseUnitId ?? "",
        type: r.type,
        amount: r.amount,
        status: r.status,
        paidOn: r.paidOn?.toISOString() ?? "",
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
