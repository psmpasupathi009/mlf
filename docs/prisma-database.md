# Prisma Database Connection (MongoDB Atlas)

How this MLF app connects to **MongoDB Atlas** through Prisma, how features use the DB, and what to do with the database before and after deploying.

The shared client lives in [`lib/db/prisma.ts`](../lib/db/prisma.ts).

## Overview — how DB connects

- **Stack:** Next.js + Prisma 6 + MongoDB Atlas
- **Flow:** `.env` `DATABASE_URL` (Atlas `mongodb+srv`) → [`prisma/schema.prisma`](../prisma/schema.prisma) → generated `@prisma/client` → singleton in [`lib/db/prisma.ts`](../lib/db/prisma.ts) → API routes, `lib/` helpers, and scripts

```mermaid
flowchart LR
  env[".env Atlas DATABASE_URL"] --> schema["prisma/schema.prisma"]
  schema -->|"prisma generate"| client["@prisma/client"]
  client --> singleton["lib/db/prisma.ts"]
  singleton --> apis["app/api/v1/**"]
  singleton --> libs["lib/**"]
  singleton --> scripts["scripts/*.ts / prisma/seed.ts"]
```

## Environment (Atlas)

Set `DATABASE_URL` to your Atlas connection string (this project expects Atlas, not a local `mongodb://` host):

```text
DATABASE_URL=mongodb+srv://USER:PASS@CLUSTER/mlf
```

Copy from [`.env.example`](../.env.example) and replace `USER`, `PASS`, and `CLUSTER` with your Atlas credentials.

**Network Access (required):** In Atlas → Network Access → **Allow Access from Anywhere** (`0.0.0.0/0`). Home/ISP IPs change day to day; allowlisting a single IP will block you again after the next change. Use `0.0.0.0/0` for local dev and Vercel so you are not asked to re-add IPs. Blocked IPs often fail as TLS `InternalError` / no primary. Verify with:

```bash
npm run db:ping
```

The app appends serverless-friendly query params when they are missing (via `buildMongoDatabaseUrl`):

| Param | Default | Purpose |
|-------|---------|---------|
| `serverSelectionTimeoutMS` | `5000` | Fail fast if Atlas is unreachable |
| `connectTimeoutMS` | `10000` | Cap connect time |
| `maxPoolSize` | `10` | Small pool per serverless isolate |
| `minPoolSize` | `0` | Do not keep idle sockets warm |
| `maxIdleTimeMS` | `30000` | Release idle connections |

### Schema datasource

From [`prisma/schema.prisma`](../prisma/schema.prisma):

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}
```

Models use MongoDB ObjectIds:

```prisma
id String @id @default(auto()) @map("_id") @db.ObjectId
```

Business keys are usually human-readable `unitId` strings (unique per entity), not the ObjectId.

## Client module (`lib/db/prisma.ts`)

Import the shared client everywhere in app code:

```ts
import { prisma } from "@/lib/db/prisma";
```

### `buildMongoDatabaseUrl`

Takes the base Atlas URL from `DATABASE_URL` and appends the serverless defaults above only when each param is not already present. Used by the app client, [`prisma/seed.ts`](../prisma/seed.ts), and [`scripts/db-ping.ts`](../scripts/db-ping.ts).

### Singleton + HMR refresh

Next.js hot reload can create many `PrismaClient` instances. The module caches one client on `globalThis`. After `prisma generate`, a stale global client may lack new model delegates (e.g. `officeHoliday`). `clientHasRequiredModels` detects that and disconnects/recreates the client.

### Eager `$connect`

After creating a client, the module calls `$connect()` so the first query after HMR does not race with “Engine is not yet connected”.

### Unreachable Atlas helpers

- **`isDbUnreachableError(error)`** — true when the error looks like Atlas/network/TLS/selection failure.
- **`withDbRetry(fn, attempts?)`** — retries transient Atlas / cold-start failures (use for idempotent or read-mostly work).

Full source:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Append `key=value` only when the param is not already present. */
function appendQueryParam(url: string, key: string, value: string): string {
  if (new RegExp(`[?&]${key}=`, "i").test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${value}`;
}

/**
 * Serverless-friendly Mongo defaults for Vercel + Atlas:
 * - fail fast on unreachable clusters (not ~30s)
 * - small pool per isolate (many concurrent lambdas)
 * - release idle sockets so frozen isolates do not hold connections forever
 */
export function buildMongoDatabaseUrl(base: string): string {
  let url = base;
  url = appendQueryParam(url, "serverSelectionTimeoutMS", "5000");
  url = appendQueryParam(url, "connectTimeoutMS", "10000");
  url = appendQueryParam(url, "maxPoolSize", "10");
  url = appendQueryParam(url, "minPoolSize", "0");
  url = appendQueryParam(url, "maxIdleTimeMS", "30000");
  return url;
}

function databaseUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  return buildMongoDatabaseUrl(base);
}

function createClient() {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/**
 * After `prisma generate`, Next.js can keep a stale global client missing new
 * delegates (e.g. officeHoliday). Drop and recreate when required models lack.
 */
function clientHasRequiredModels(client: PrismaClient): boolean {
  const c = client as unknown as Record<string, unknown>;
  return (
    typeof c.officeHoliday === "object" &&
    c.officeHoliday != null &&
    typeof c.notification === "object" &&
    c.notification != null &&
    typeof c.dakEntry === "object" &&
    c.dakEntry != null &&
    typeof c.officeTask === "object" &&
    c.officeTask != null
  );
}

function resolveClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && clientHasRequiredModels(existing)) return existing;
  if (existing) {
    // Only disconnect when replacing a broken/stale client — never after each request.
    globalForPrisma.prisma = undefined;
    void existing.$disconnect().catch(() => undefined);
  }
  const next = createClient();
  // Eager connect so the first query after HMR/recreate does not race
  // "Engine is not yet connected". Keep the client warm on the isolate.
  void next.$connect().catch(() => undefined);
  globalForPrisma.prisma = next;
  return next;
}

export const prisma = resolveClient();

// Prefer specific connection failures — avoid bare "timeout" (e.g. OTP messages).
const UNREACHABLE_RE =
  /server selection|serverselection|econnrefused|econnreset|enotfound|etimedout|(?:connection|socket|server|operation|network)\s+timed?\s*out|timed\s+out|connect(?:ion)? (?:refused|reset|failed|closed)|noprimary|no primary|replicasetnoprimary|replica set|mongodb.*(connect|network)|engine is not yet connected|prisma.?client.?initialization|can't reach database|could not connect|tlsv1 alert internal error|fatal alert:\s*internalerror|internalerror/i;

/** True when Mongo/Atlas is unreachable or the engine is not ready yet. */
export function isDbUnreachableError(error: unknown): boolean {
  if (error == null) return false;
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String(error);
  return UNREACHABLE_RE.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry transient Atlas / cold-start connection failures.
 * Use only for idempotent or read-mostly work — not non-idempotent writes.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isDbUnreachableError(error) || i === attempts - 1) throw error;
      await sleep(120 * 2 ** i);
    }
  }
  throw last;
}

export type {
  User,
  UserRole,
  OtpPurpose,
  OtpSession,
} from "@prisma/client";
```

## How the database is used (by feature)

App code imports `prisma` from `@/lib/db/prisma`. Seed / ping scripts may construct their own `PrismaClient` with `buildMongoDatabaseUrl` and should `$disconnect()` when done.

### Models (from schema)

| Area | Models |
|------|--------|
| Auth / access | `User`, `OtpSession`, `ConsumedOtpProof`, `RolePermission`, `RateLimit` |
| Ops / IDs | `IdCounter`, `AuditLog` |
| Practice | `Client`, `Case`, `Hearing`, `Document`, `Appointment` |
| Money | `CashPayment` |
| Office | `DakEntry`, `OfficeTask`, `OfficeHoliday`, `Notification` |
| HRMS | `Attendance`, `LeaveRequest` |
| Advocate calendar | `AdvocateWeeklyHours`, `AdvocateTimeBlock` |

### Feature → Prisma map

- **Auth / users** — `User`, `OtpSession`, `ConsumedOtpProof`, `RateLimit` via `app/api/v1/auth/**`, session helpers under `lib/auth/` (access JWT cookie only; 7-day TTL — no refresh tokens)
- **Employees / permissions** — `User`, `RolePermission`, `AuditLog` via `app/api/v1/employees/**`, `app/api/v1/permissions/**`
- **Clients / cases / hearings** — `Client`, `Case`, `Hearing` via `app/api/v1/clients/**`, `app/api/v1/cases/**`, diary routes
- **Appointments / advocates** — `Appointment`, `AdvocateWeeklyHours`, `AdvocateTimeBlock` via `app/api/v1/appointments/**`, `app/api/v1/advocates/**`
- **Accounts (cash)** — `CashPayment` (+ related `Client` / `Case`) via `app/api/v1/accounts/**`
- **Documents** — `Document` via `app/api/v1/documents/**`
- **Office dak / tasks / holidays** — `DakEntry`, `OfficeTask`, `OfficeHoliday` via `app/api/v1/dak/**`, `app/api/v1/tasks/**`, `app/api/v1/hrms/holidays/**`
- **HRMS** — `Attendance`, `LeaveRequest` via `app/api/v1/hrms/**`
- **Notifications** — `Notification` via `app/api/v1/notifications/**`
- **Dashboard / search / exports** — aggregate reads across models via `app/api/v1/dashboard/**`, `app/api/v1/search/**`, `app/api/v1/exports/**`
- **Scripts** — [`prisma/seed.ts`](../prisma/seed.ts), [`scripts/db-ping.ts`](../scripts/db-ping.ts), [`scripts/full-audit.ts`](../scripts/full-audit.ts) (own client or shared helpers)

### Usage snippets

From [`app/api/v1/notifications/[unitId]/read/route.ts`](../app/api/v1/notifications/[unitId]/read/route.ts):

```ts
import { prisma } from "@/lib/db/prisma";

const item = unitId
  ? await prisma.notification.findUnique({ where: { unitId } })
  : null;
```

From accounts create ([`app/api/v1/accounts/route.ts`](../app/api/v1/accounts/route.ts)):

```ts
import { prisma } from "@/lib/db/prisma";

const client = await prisma.client.findUnique({ where: { unitId: clientUnitId } });
const created = await prisma.cashPayment.create({ /* ... */ });
```

## Dev vs production database

| | Development | Production (deploy) |
|--|-------------|---------------------|
| Host | MongoDB Atlas (same stack) | MongoDB Atlas (prefer a **separate** cluster or DB name) |
| Env | Local `.env` `DATABASE_URL` | Host env (e.g. Vercel) `DATABASE_URL` |
| Access | Atlas Network Access `0.0.0.0/0` (or your IP) | Same; Vercel egress IPs vary |

- Never commit `.env`; set `DATABASE_URL` (and secrets below) in the deployment platform’s env config.
- Same Prisma schema / client code works for both; only the URL and Atlas network access change.
- Do not point local `.env` at prod casually; use a separate prod env or a one-off shell export when pushing schema.

## Before deploying (database checklist)

```mermaid
flowchart TD
  before["Before deploy"] --> provision["Provision MongoDB Atlas"]
  provision --> network["Open network access 0.0.0.0/0"]
  network --> envHost["Set DATABASE_URL + secrets on host"]
  envHost --> pushSchema["db:generate + db:push to prod"]
  pushSchema --> optionalSeed["Optional seed / admin bootstrap"]
  optionalSeed --> deployApp["Deploy Next.js app"]
```

1. **Provision** production MongoDB Atlas; note DB name (e.g. `mlf` or `mlf_prod`).
2. **Network access** — allow `0.0.0.0/0` (or VPC/peering if you have it) so Vercel can reach Atlas.
3. **DB user** — create a production DB user and copy the `mongodb+srv` connection string.
4. **Host env** — set at least:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `ADMIN_MOBILE`
   - `TWO_FACTOR_API_KEY` (+ template / sender as needed)
   - `CRON_SECRET`
   - `ALLOWED_ORIGINS` / public app URL as used by the host
   - `NODE_ENV=production`
5. From a machine that can reach **prod** Atlas: run `npm run db:generate` and `npm run db:push` with production `DATABASE_URL` so collections/indexes match [`prisma/schema.prisma`](../prisma/schema.prisma).
6. **Optional seed:** `npm run db:seed` against prod only if intentional — seed upserts demo/bootstrap data; do not wipe live data by accident.
7. Confirm **`postinstall` / build** runs `prisma generate` on the host so `@prisma/client` exists at runtime (`postinstall` in [`package.json`](../package.json) already does this).
8. Prefer a one-off `DATABASE_URL=... npm run db:push` for prod schema pushes rather than permanently switching local `.env` to prod.

## After deploying (database checklist)

1. **Redeploy/restart** if env vars were added after the first deploy (host must pick up `DATABASE_URL`).
2. **Smoke-test** DB-backed flows on the live site:
   - Check mobile / send OTP / login (writes `OtpSession` / reads `User`)
   - Dashboard summary (reads `Case`, `Hearing`, etc.)
   - Clients list / create (reads/writes `Client`)
   - Cases / diary hearings (reads/writes `Case`, `Hearing`)
   - Accounts payment create (writes `CashPayment`)
   - Admin: create/edit employee
3. If API returns **500** on data routes: check host logs, verify `DATABASE_URL`, Atlas allowlist, and that `prisma generate` ran during build. Locally mirror with `npm run db:ping`.
4. **Schema changes later:** update [`prisma/schema.prisma`](../prisma/schema.prisma) → `db:push` to **prod** → redeploy the app.
5. **Backups:** enable Atlas backups / snapshots for production.
6. Do **not** run destructive seed or wipe scripts against production unless replacing data on purpose.

## Setup commands (reference)

| Script | Command | Purpose |
|--------|---------|---------|
| `db:generate` | `prisma generate` | Generate Prisma Client |
| `db:push` | `prisma db push` | Push schema to Atlas |
| `db:seed` | `npx tsx prisma/seed.ts` | Seed / bootstrap data |
| `db:studio` | `prisma studio` | Browse data |
| `db:ping` | `npx tsx scripts/db-ping.ts` | Check Atlas connectivity |

`postinstall` runs `prisma generate` automatically after `npm install`.

## Connection lifecycle

1. Client is created once per process/isolate when the module loads (`resolveClient`).
2. Queries use the Atlas connection pool managed by Prisma — no manual `connect()` / `disconnect()` in API routes.
3. If Atlas is unreachable (Network Access not set to `0.0.0.0/0`, paused cluster, TLS), errors match `isDbUnreachableError`; `npm run db:ping` prints actionable hints.
