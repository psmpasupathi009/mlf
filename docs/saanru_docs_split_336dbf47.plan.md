---
name: SAANRU Docs Split
overview: Three website plan docs under docs/saanru/ plus full-product integration — shared MongoDB, monorepo, 3-site wiring, MLF parity complete in Office Portal doc.
todos:
  - id: create-saanru-folder
    content: Create folder docs/saanru/ in the repo
    status: completed
  - id: create-01-super-admin
    content: Add docs/saanru/01-website-super-admin.md — full admin.saanru.com build plan
    status: completed
  - id: create-02-office-portal
    content: Add docs/saanru/02-website-office-portal.md — full MLF parity + DB + config seeds
    status: completed
  - id: create-03-marketing
    content: Add docs/saanru/03-website-marketing.md — full saanru.com marketing build plan
    status: completed
  - id: stub-old-plan
    content: Replace multi-office_saas_plan body with redirect stub to docs/saanru/
    status: completed
  - id: parity-audit
    content: MLF parity audit gaps added to 02-office-portal.md (designations, exports, pipeline, compliance, etc.)
    status: completed
  - id: integration-plan
    content: Full-product integration + database access documented in this plan
    status: completed
isProject: false
---

# SAANRU — Full Product Plan

## Website docs (build from these)

```text
docs/saanru/
  01-website-super-admin.md      → admin.saanru.com
  02-website-office-portal.md    → app.saanru.com (full MLF + DB + seeds)
  03-website-marketing.md        → saanru.com
```

| File | Domain | Role |
|------|--------|------|
| [`01-website-super-admin.md`](saanru/01-website-super-admin.md) | `admin.saanru.com` | Create offices, plans, subscriptions |
| [`02-website-office-portal.md`](saanru/02-website-office-portal.md) | `app.saanru.com` | Staff + client portal (MLF parity) |
| [`03-website-marketing.md`](saanru/03-website-marketing.md) | `saanru.com` | Public site, pricing, lead capture |

**MLF repo** = reference only. Do **not** retrofit MLF. Build new monorepo `saanru/`.

---

## Full product architecture

```mermaid
flowchart TB
  subgraph public [Public]
    marketing["saanru.com\nMarketing"]
  end
  subgraph platform [Platform apps]
    sa["admin.saanru.com\nSuper Admin"]
    portal["app.saanru.com\nOffice Portal"]
  end
  subgraph shared [Shared backend]
    db[(MongoDB Atlas)]
    storage[(S3 / R2 files)]
    razorpay[Razorpay]
    sms[SMS provider]
  end
  marketing -->|"Contact / trial CTA"| sa
  sa -->|"Create Office + Subscription + Admin"| db
  sa -->|"Invite SMS"| portal
  portal -->|"officeId CRUD"| db
  portal -->|"Uploads"| storage
  portal -->|"Checkout /billing"| razorpay
  razorpay -->|"Webhooks"| portal
  portal -->|"Hearing SMS"| sms
  sa -->|"Read Office Plan Sub"| db
```

### How the 3 sites work together

| Step | Who | Where | What |
|------|-----|-------|------|
| 1 | Prospect | `saanru.com` | Reads features/pricing → submits contact form |
| 2 | Platform owner | `admin.saanru.com` | Creates office wizard → OFF + trial SUB + first admin |
| 3 | System | SMS | Sends invite link to `app.saanru.com/login` |
| 4 | Office admin | `app.saanru.com` | OTP → PIN → dashboard |
| 5 | Office admin | `/billing` | Upgrades via Razorpay when trial ends |
| 6 | Staff | `app.saanru.com` | Uses modules per plan (clients, cases, …) |
| 7 | Staff | client detail | Invites client to portal |
| 8 | Client | `app.saanru.com` | Limited nav: cases, appointments, documents |
| 9 | Platform owner | `admin.saanru.com` | Monitors subs, suspends, extends trials |

**Cookies are separate:** `saanru_sa_access` (admin) vs `saanru_op_access` (portal). No cross-domain session.

**Marketing v1:** no DB required; contact form → email or webhook. Optional `Lead` model in shared DB for v1.1.

---

## Monorepo layout

```text
saanru/
  apps/
    super-admin/          # admin.saanru.com
    office-portal/        # app.saanru.com
    marketing/            # saanru.com
  packages/
    db/                   # Prisma schema + client + seed
    shared/               # IDs, Zod, API envelope, plan helpers, IST utils
    ui/                   # shadcn primitives (optional shared)
  docs/                   # copy from mlf/docs/saanru/ when splitting repo
  package.json            # pnpm workspace
  turbo.json              # optional build orchestration
```

**Deploy:** 3 separate Vercel projects, same git repo, different root directories.

---

## Database — how to access & use

### One cluster, shared schema

All platform + tenant data lives in **one MongoDB Atlas database** (e.g. database name `saanru`).

```text
DATABASE_URL=mongodb+srv://USER:PASS@CLUSTER.saanru.mongodb.net/saanru
```

### Prisma setup (`packages/db`)

```text
packages/db/
  prisma/
    schema.prisma       # Platform + office-scoped models
    seed.ts             # Platform owner, 3 plans, demo office
  src/
    client.ts           # Singleton PrismaClient export
  package.json
```

**Commands (monorepo root):**

```bash
pnpm db:generate      # prisma generate
pnpm db:push          # push schema to Atlas (dev)
pnpm db:seed          # seed plans + demo office
pnpm db:ping          # connectivity check
pnpm db:studio        # Prisma Studio GUI — browse/edit data locally
```

**Prisma Studio** = easiest way to inspect offices, users, cases during dev (`pnpm db:studio` → browser UI on local machine, connects to Atlas via `DATABASE_URL`).

### Model split

| Layer | Models | Who writes |
|-------|--------|------------|
| Platform | `PlatformUser`, `Office`, `Plan`, `Subscription`, `Invoice`, `UsageCounter`, `WebhookEvent`, `PlatformAuditLog` | Super Admin (+ portal webhooks) |
| Tenant | All MLF models + `officeId` | Office Portal only |
| Membership | `OfficeMembership` | Super Admin on create; portal on employee add |

### Tenancy rules (critical)

1. Every portal query includes `where: { officeId }`
2. JWT carries `oid` = office unitId → resolve to ObjectId once per request
3. Cross-office unitId in URL → **404**
4. Super Admin never exposes case/client APIs
5. `(officeId, mobile)` unique on User; platform mobiles on `PlatformUser` separately

### Local dev workflow

1. Clone `saanru` monorepo
2. Copy `.env.example` → `.env` with Atlas `DATABASE_URL`
3. `pnpm install && pnpm db:generate && pnpm db:push && pnpm db:seed`
4. Run apps in parallel:
   ```bash
   pnpm --filter super-admin dev    # :3001
   pnpm --filter office-portal dev  # :3000
   pnpm --filter marketing dev      # :3002
   ```
5. Use seed demo office admin mobile from seed output to login portal
6. Use seed platform owner mobile for Super Admin

### Production env (per deploy)

| App | Required env |
|-----|--------------|
| Super Admin | `DATABASE_URL`, `JWT_SECRET_SA`, `TWO_FACTOR_*` |
| Office Portal | `DATABASE_URL`, `JWT_SECRET_OP`, `RAZORPAY_*`, `TWO_FACTOR_*`, `CRON_SECRET`, `S3_*` or `R2_*` |
| Marketing | None for v1 (optional `CONTACT_WEBHOOK_URL`) |

**Never share JWT secrets between apps.**

---

## Integration checklist (full product)

### Phase 0 — Foundation
- [ ] Scaffold monorepo + `packages/db` schema (all models + `officeId`)
- [ ] Shared IDs, Zod, API envelope from MLF patterns
- [ ] Seed: platform owner, 3 plans, demo office

### Phase 1 — Super Admin
- [ ] SA auth + offices wizard (creates Office + Sub + Admin + seeds)
- [ ] Plans CRUD, subscriptions list, danger zone
- [ ] See [`01-website-super-admin.md`](saanru/01-website-super-admin.md)

### Phase 2 — Billing wire-up
- [ ] Razorpay checkout on portal `/billing`
- [ ] Webhook on **office-portal** domain (not marketing)
- [ ] Plan gates in portal middleware/guards
- [ ] UsageCounter for seats / SMS / storage

### Phase 3 — Portal core (MLF parity)
- [ ] Auth + office picker + employees + permissions
- [ ] Clients (+ portal invite), cases/hearings, diary, home, notifications
- [ ] Per-office config seeds on provision
- [ ] See [`02-website-office-portal.md`](saanru/02-website-office-portal.md)

### Phase 4 — Portal schedule & money
- [ ] Appointments, availability, court roster, client portal
- [ ] Accounts, expenses, documents, dak, tasks, reports, CSV imports

### Phase 5 — Portal ops
- [ ] HRMS, cron SMS, object storage for files, office branding

### Phase 6 — Marketing + hardening
- [ ] Marketing site live on `saanru.com`
- [ ] Cross-office isolation tests
- [ ] Subscription E2E (trial → pay → upgrade → suspend)
- [ ] See [`03-website-marketing.md`](saanru/03-website-marketing.md)

---

## MLF parity status

**Module-level:** complete — all nav items, pages, APIs in [`02-website-office-portal.md`](saanru/02-website-office-portal.md).

**Depth added (audit fixes):**
- Designations + role prefill
- Case pipeline (11 statuses) + case types + stages
- All 10 export types incl. `fees-outstanding` + HRMS `attendance`
- Per-office config seeds table
- Payment/expense/document enums
- Client field stripping list
- Staff `video` appointments vs client office/call only
- Availability + office holidays
- Home dashboard widgets
- HRMS URL tabs
- Client detail composite UI
- Session/proxy/PIN lockout/SMS/cron details
- Database access section
- Object storage note (not local disk in prod)

---

## Suggestions (recommended additions)

### Must-do before prod
1. **Object storage (S3/R2)** — MLF uses local `uploads/`; SAANRU multi-tenant needs durable storage with quota metering
2. **Cross-office isolation test suite** — automated tests that prove 404 on wrong `officeId`
3. **Webhook idempotency** — `WebhookEvent` table; reject replayed Razorpay events
4. **Backup strategy** — Atlas continuous backup + restore runbook

### Should-do v1
5. **Shared `packages/ui`** — copy MLF shadcn components once; 3 apps stay visually consistent
6. **Contact → Lead pipeline** — marketing form writes to DB or CRM webhook; SA sees leads
7. **Health endpoints** — `/api/health` on each app (DB ping) for monitoring
8. **Staging environment** — separate Atlas DB + Vercel preview per app

### Nice v1.1
9. **Self-serve trial signup** — marketing → auto-create draft office (still needs SA approve)
10. **Mobile app** — see MLF [`docs/react_native_mobile_app_7f22bfd5.plan.md`](../react_native_mobile_app_7f22bfd5.plan.md) (Bearer JWT against portal APIs)
11. **Add-on packs** — extra seats / SMS packs in billing
12. **Office CSV export audit** — bulk export for office admin data portability

### Do not build in v1
- Custom domains per office
- Email/OAuth login
- Client online fee payment
- Knowledge base / wiki
- Retrofit MLF single-tenant app

---

## Success criteria

- [x] 3 website docs under `docs/saanru/`
- [x] Office Portal doc has full MLF module list + depth supplements
- [x] Database access + 3-site integration documented here
- [ ] Monorepo built and deployed (implementation — next phase)
- [ ] End-to-end: marketing lead → SA create office → portal login → billing → client invite
