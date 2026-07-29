# MLF — Law Firm Portal

Next.js office portal for clients, cases, hearings, appointments, accounts, HRMS, and related office workflows. Stack: **Next.js · Prisma 6 · MongoDB Atlas · JWT session · 2Factor SMS**.

## Getting started

```bash
npm install
cp .env.example .env   # set DATABASE_URL and other secrets
npm run db:generate
npm run db:ping
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Home lives at `app/(portal)/page.tsx` (not a root `app/page.tsx`).

## Docs

| Doc | What it covers |
|-----|----------------|
| [docs/application-flows.md](docs/application-flows.md) | Folder layout, auth layers, each feature flow, what to keep/clean |
| [docs/prisma-database.md](docs/prisma-database.md) | Atlas connection, Prisma client, deploy DB checklist |
| [prisma/data/README.md](prisma/data/README.md) | CSV import order and sample rules |

## Layout (short)

```text
app/(portal)/     Logged-in pages
app/(auth)/       Login
app/api/          REST APIs
features/         Domain UI + server helpers
lib/              Auth, RBAC, DB, validations, imports
shared/           Shell, dialogs, shared hooks
config/company/   Modules, nav, permissions, IDs
proxy.ts          Edge login gate (pages only)
```

## Database

Uses **Prisma + MongoDB Atlas**. Put your `mongodb+srv://...` string in `.env` as `DATABASE_URL`, then:

```bash
npm run db:ping
```

## Deploy

Deploy on [Vercel](https://vercel.com) (see `vercel.json` for cron). Set production env vars from `.env.example`, including `DATABASE_URL`, `JWT_SECRET`, and `CRON_SECRET`. DB steps: [docs/prisma-database.md](docs/prisma-database.md).
