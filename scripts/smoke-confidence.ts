/**
 * Confidence check via live API (no PIN mutation).
 * Issues a real session with issueAuthTokens (same path login uses after PIN verify),
 * then: client → case → hearing → diary → doc → payment → HRMS check-in.
 *
 * Run: npx tsx scripts/smoke-confidence.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { issueAuthTokens, type AuthUser } from "../lib/auth/session";
import { getEnvAdminMobile } from "../lib/auth/mobile";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const prisma = new PrismaClient();

type StepResult = { step: string; ok: boolean; detail: string };

function maskMobile(m: string) {
  return m.replace(/\d(?=\d{4})/g, "*");
}

async function api(
  token: string,
  method: string,
  path: string,
  body?: unknown
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { res, json };
}

function pickUnitId(json: unknown, key: string): string | undefined {
  const data = (json as { data?: Record<string, { unitId?: string }> })?.data;
  return data?.[key]?.unitId;
}

function detail(status: number, json: unknown, key?: string) {
  const j = json as {
    error?: { message?: string; code?: string };
  };
  const msg = j?.error?.message ?? j?.error?.code ?? "";
  const id = key ? pickUnitId(json, key) : undefined;
  return `HTTP ${status}${msg ? ` — ${msg}` : ""}${id ? ` (${id})` : ""}`;
}

function okish(status: number, json: unknown) {
  const j = json as { ok?: boolean; error?: { code?: string } };
  if (status >= 200 && status < 300 && j?.ok !== false) return true;
  if (status === 409 && j?.error?.code === "CONFLICT") return true;
  return false;
}

async function waitForServer(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/auth/check-mobile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: "9000000000" }),
      });
      if (r.status > 0) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not reachable at ${BASE}`);
}

async function main() {
  const results: StepResult[] = [];

  const adminMobileEnv = getEnvAdminMobile();
  const user =
    (adminMobileEnv
      ? await prisma.user.findUnique({ where: { mobile: adminMobileEnv } })
      : null) ??
    (await prisma.user.findFirst({
      where: { isActive: true, roles: { has: "admin" }, pinHash: { not: null } },
    }));

  if (!user?.pinHash) {
    throw new Error("No active admin user with a PIN found in the database");
  }

  console.log(`Using admin ${user.unitId} (${maskMobile(user.mobile)})`);
  await waitForServer();

  // 1. Login endpoint reachable + rejects bad PIN (no lock risk: wrong format/short)
  const badLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: user.mobile, pin: "0000" }),
  });
  const badJson = await badLogin.json().catch(() => ({}));
  results.push({
    step: "1. Login endpoint (rejects invalid PIN)",
    ok: badLogin.status === 400 || badLogin.status === 401,
    detail: detail(badLogin.status, badJson),
  });

  // Issue session the same way login does after a correct PIN
  const tokens = await issueAuthTokens(user as unknown as AuthUser);
  const token = tokens.accessToken;

  const me = await api(token, "GET", "/api/auth/me");
  results.push({
    step: "1b. Authenticated session (/me)",
    ok: me.res.ok,
    detail: detail(me.res.status, me.json),
  });
  if (!me.res.ok) throw new Error("Session failed — aborting");

  // 2. Add client
  const stamp = Date.now().toString().slice(-6);
  const clientMobile = `98${stamp}${stamp.slice(0, 2)}`.slice(0, 10);
  const clientRes = await api(token, "POST", "/api/clients", {
    name: `Smoke Test Client ${stamp}`,
    mobile: clientMobile,
    state: "Tamil Nadu",
    district: "Erode",
    city: "Gobichettipalayam",
    matterBrief: "Automated confidence check — safe to delete",
    smsConsent: false,
  });
  const clientUnitId = pickUnitId(clientRes.json, "client");
  results.push({
    step: "2. Add client",
    ok: okish(clientRes.res.status, clientRes.json) && Boolean(clientUnitId),
    detail: detail(clientRes.res.status, clientRes.json, "client"),
  });
  if (!clientUnitId) {
    console.log("\n=== Partial results ===");
    for (const r of results) {
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}  — ${r.detail}`);
    }
    throw new Error("Client create failed — aborting");
  }

  // 3. Open case
  const caseRes = await api(token, "POST", "/api/cases", {
    clientUnitId,
    state: "Tamil Nadu",
    district: "Erode",
    city: "Gobichettipalayam",
    courtName: "District Munsif Court, Gobichettipalayam",
    caseType: "OS",
    caseYear: new Date().getFullYear(),
    primaryAdvocateMobile: user.mobile.replace(/\D/g, "").slice(-10),
    advocateMobiles: [user.mobile.replace(/\D/g, "").slice(-10)],
    opposingParty: "Smoke Opposing Party",
    ourSide: "petitioner",
    notes: "Automated confidence check — safe to delete",
    agreedFee: 1000,
  });
  const caseUnitId = pickUnitId(caseRes.json, "case");
  results.push({
    step: "3. Open case",
    ok: okish(caseRes.res.status, caseRes.json) && Boolean(caseUnitId),
    detail: detail(caseRes.res.status, caseRes.json, "case"),
  });
  if (!caseUnitId) {
    console.log("\n=== Partial results ===");
    for (const r of results) {
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}  — ${r.detail}`);
    }
    throw new Error("Case create failed — aborting");
  }

  const caseGet = await api(token, "GET", `/api/cases/${caseUnitId}`);
  results.push({
    step: "3b. Open case detail",
    ok: caseGet.res.ok,
    detail: detail(caseGet.res.status, caseGet.json),
  });

  // 4. Add hearing
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const dd = String(tomorrow.getDate()).padStart(2, "0");
  const hearingDate = `${yyyy}-${mm}-${dd}`;

  const hearingRes = await api(
    token,
    "POST",
    `/api/cases/${caseUnitId}/hearings`,
    {
      hearingDate,
      purpose: "Smoke check hearing",
      notes: "Automated confidence check",
    }
  );
  results.push({
    step: "4. Add hearing",
    ok: okish(hearingRes.res.status, hearingRes.json),
    detail: detail(hearingRes.res.status, hearingRes.json),
  });

  // 5. Diary
  const diaryRes = await api(token, "GET", `/api/diary?date=${hearingDate}`);
  results.push({
    step: "5. Check diary",
    ok: diaryRes.res.ok,
    detail: detail(diaryRes.res.status, diaryRes.json),
  });

  // 6. Upload document (PNG — txt is rejected by storage allowlist)
  const form = new FormData();
  // 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const blob = new Blob([png], { type: "image/png" });
  form.append("file", blob, "smoke-test.png");
  form.append("title", `Smoke doc ${stamp}`);
  form.append("docType", "other");
  form.append("caseUnitId", caseUnitId);
  form.append("clientUnitId", clientUnitId);
  form.append("notes", "Automated confidence check");
  const docRes = await api(token, "POST", "/api/documents", form);
  results.push({
    step: "6. Upload document",
    ok: okish(docRes.res.status, docRes.json),
    detail: detail(docRes.res.status, docRes.json),
  });

  // 7. Payment
  const payRes = await api(token, "POST", "/api/accounts", {
    clientUnitId,
    caseUnitId,
    type: "advance",
    amount: 500,
    status: "paid",
    paidOn: hearingDate,
    notes: "Smoke test payment — safe to void/delete",
  });
  results.push({
    step: "7. Create payment",
    ok: okish(payRes.res.status, payRes.json),
    detail: detail(payRes.res.status, payRes.json),
  });

  // 8. HRMS check-in (409 already checked-in / holiday / leave = acceptable)
  const hrmsRes = await api(token, "POST", "/api/hrms/attendance/check-in", {
    notes: "Smoke confidence check",
    latitude: 11.341,
    longitude: 77.7172,
    accuracy: 25,
  });
  results.push({
    step: "8. HRMS check-in",
    ok: okish(hrmsRes.res.status, hrmsRes.json),
    detail: detail(hrmsRes.res.status, hrmsRes.json),
  });

  console.log("\n=== Confidence check results ===");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}  — ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${failed.length === 0 ? "ALL PASSED" : `${failed.length} FAILED`} (${results.length} steps)`
  );
  console.log(
    `\nCreated smoke records: client ${clientUnitId}, case ${caseUnitId} (safe to delete).`
  );
  console.log(
    "Note: real browser PIN login was not entered; session was issued the same way login does after a correct PIN."
  );

  await prisma.$disconnect();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Smoke script crashed:", err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
