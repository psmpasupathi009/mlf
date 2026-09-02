# Scripts

Local / CI helpers. Run from repo root with `npx tsx scripts/<name>.ts` (or the npm script if one exists).

| Script | Purpose |
|--------|---------|
| `db-ping.ts` | Verify `DATABASE_URL` / Prisma can reach Mongo |
| `full-audit.ts` | Broader consistency checks |
| `smoke-confidence.ts` | HTTP smoke against a running app |
| `backfill-appointment-client-ids.ts` | Set `Appointment.clientId` where only `clientUnitId` was stored |
| `backfill-client-portal-login-ids.ts` | Align legacy client portal `User.unitId` from `EMP-…` to `CLI-…` |

## Smoke env

| Variable | Role |
|----------|------|
| `SMOKE_BASE_URL` | App origin (default often `http://localhost:3000`) |
| `SMOKE_PIN` | PIN for the smoke test user |
| `SMOKE_MOBILE` | Mobile for that user (if required by the script) |

Do not commit real PINs or `.env` values.
