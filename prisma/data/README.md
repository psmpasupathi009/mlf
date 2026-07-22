# CSV import templates

Canonical downloadable templates live in **`public/samples/`** (Import → Download template).

This folder mirrors those files for seed/docs and offline copy:

| File | Module |
|------|--------|
| `employees.sample.csv` | Employees |
| `clients.sample.csv` | Clients |
| `cases.sample.csv` | Cases |
| `hearings.sample.csv` | Cases → Import hearings |
| `payments.sample.csv` | Accounts (admin) |
| `appointments.sample.csv` | Reference only (no bulk import UI yet) |

## Rules

- UTF-8 CSV, header row required
- Dates: `YYYY-MM-DD` (IST)
- Mobile: 10 digits (app normalizes to `91…`)
- `unitId` optional — empty → auto `EMP/CLI/CSE/…`
- Always dry-run in the UI first

Keep `public/samples/*.sample.csv` in sync when you change templates here.
