# CSV import templates

Canonical downloadable templates live in **`public/samples/`** (Import → Download sample CSV).

This folder mirrors those files for seed/docs and offline copy.

## Import order

1. **Clients** (creates `CLI-…` unitIds)
2. **Cases** (requires `clientUnitId` from step 1)
3. Then any of: hearings, payments, dak, tasks, appointments (use `caseUnitId` / `clientUnitId`)

| File | Module |
|------|--------|
| `employees.sample.csv` | Employees |
| `clients.sample.csv` | Clients |
| `cases.sample.csv` | Cases |
| `hearings.sample.csv` | Cases → Import hearings |
| `payments.sample.csv` | Accounts |
| `dak.sample.csv` | Dak |
| `tasks.sample.csv` | Tasks |
| `appointments.sample.csv` | Appointments (bulk import UI) |

## Rules

- UTF-8 CSV, header row required
- Dates: `YYYY-MM-DD` (IST); appointments `scheduledAt` may be ISO datetime
- Mobile: 10 digits (app normalizes to `91…`)
- Link related rows with `*UnitId` only (no mobile/caseNumber FK columns)
- Empty `unitId` on clients/cases/employees → auto-generated id
- Extra CSV columns are ignored; dry-run lists them as `ignoredColumns`
- Always dry-run in the UI first

Keep `public/samples/*.sample.csv` in sync when you change templates here.
