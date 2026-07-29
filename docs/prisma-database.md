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

1. Sign in to [MongoDB Atlas](https://cloud.mongodb.com).
2. Copy your cluster connection string.
3. Put it in `.env` as `DATABASE_URL`:

```text
DATABASE_URL=mongodb+srv://USER:PASS@CLUSTER/mlf
```

Copy from [`.env.example`](../.env.example) and replace `USER`, `PASS`, and `CLUSTER` with your Atlas credentials. That is all — Prisma connects using this URL.

Verify with:

```bash
npm run db:ping
```

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

Next.js hot reload can create many `PrismaClient` instances. The module keeps one client on `globalThis` in development.

Full source:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### Helpers

- [`lib/db/unreachable.ts`](../lib/db/unreachable.ts) — `isDbUnreachableError` / `withDbRetry` for Atlas outage handling.

## How the database is used (by feature)

App code imports `prisma` from `@/lib/db/prisma`. Seed / ping scripts may construct their own `PrismaClient` (reads `DATABASE_URL` from env) and should `$disconnect()` when done.

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
| Host | MongoDB Atlas | MongoDB Atlas (prefer a **separate** cluster or DB name) |
| Env | Local `.env` `DATABASE_URL` | Host env (e.g. Vercel) `DATABASE_URL` |

- Never commit `.env`; set `DATABASE_URL` (and secrets below) in the deployment platform’s env config.
- Same Prisma schema / client code works for both; only the connection string changes.
- Do not point local `.env` at prod casually; use a separate prod env or a one-off shell export when pushing schema.

## Before deploying (database checklist)

```mermaid
flowchart TD
  before["Before deploy"] --> provision["Sign in to MongoDB Atlas"]
  provision --> connect["Copy connection string"]
  connect --> envHost["Set DATABASE_URL + secrets on host"]
  envHost --> pushSchema["db:generate + db:push to prod"]
  pushSchema --> optionalSeed["Optional seed / admin bootstrap"]
  optionalSeed --> deployApp["Deploy Next.js app"]
```

1. **Sign in** to MongoDB Atlas and note the DB name (e.g. `mlf` or `mlf_prod`).
2. **Connection string** — copy the `mongodb+srv` URI for your cluster user.
3. **Host env** — set at least:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `ADMIN_MOBILE`
   - `TWO_FACTOR_API_KEY` (+ template / sender as needed)
   - `CRON_SECRET`
   - `ALLOWED_ORIGINS` / public app URL as used by the host
   - `NODE_ENV=production`
4. From a machine that can reach **prod** Atlas: run `npm run db:generate` and `npm run db:push` with production `DATABASE_URL` so collections/indexes match [`prisma/schema.prisma`](../prisma/schema.prisma).
5. **Optional seed:** `npm run db:seed` against prod only if intentional — seed upserts demo/bootstrap data; do not wipe live data by accident.
6. Confirm **`postinstall` / build** runs `prisma generate` on the host so `@prisma/client` exists at runtime (`postinstall` in [`package.json`](../package.json) already does this).
7. Prefer a one-off `DATABASE_URL=... npm run db:push` for prod schema pushes rather than permanently switching local `.env` to prod.

## After deploying (database checklist)

1. **Redeploy/restart** if env vars were added after the first deploy (host must pick up `DATABASE_URL`).
2. **Smoke-test** DB-backed flows on the live site:
   - Check mobile / send OTP / login (writes `OtpSession` / reads `User`)
   - Dashboard summary (reads `Case`, `Hearing`, etc.)
   - Clients list / create (reads/writes `Client`)
   - Cases / diary hearings (reads/writes `Case`, `Hearing`)
   - Accounts payment create (writes `CashPayment`)
   - Admin: create/edit employee
3. If API returns **500** on data routes: check host logs, verify `DATABASE_URL`, and that `prisma generate` ran during build. Locally mirror with `npm run db:ping`.
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

1. Client is created once per process/isolate when the module loads (`globalThis` singleton in development).
2. Queries use the Atlas connection pool managed by Prisma — no manual `connect()` / `disconnect()` in API routes.
3. If Atlas is unreachable (bad `DATABASE_URL`, paused cluster, TLS), errors match `isDbUnreachableError` in [`lib/db/unreachable.ts`](../lib/db/unreachable.ts); `npm run db:ping` prints actionable hints.
