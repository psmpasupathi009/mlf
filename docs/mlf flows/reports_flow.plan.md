---
name: Reports Flow
overview: Staff Excel exports via GET /api/exports?type=… — requires reports.view plus domain view (attendance uses HRMS perms so history works without Reports nav).
---

# Reports flow (`/reports`)

## Core principle: read-only Excel exports across domains

**Reports** is not a write domain. UI picks an export type; server builds an ExcelJS workbook. Most types need `reports.view` **then** the domain `*.view`. Attendance can also run from HRMS history with HRMS perms alone.

```mermaid
flowchart LR
  page["/reports"] --> api["GET /api/exports?type="]
  api --> xlsx["ExcelJS workbook"]
```

---

## Permissions / nav

| Gate | Value |
|------|--------|
| Nav | Office → Reports · `reports.view` · **staffOnly** |
| Typical export | `reports.view` + domain `*.view` |
| Attendance | `hrms.own_attendance` (self) or `hrms.manage_attendance` + `all=1` (office) |

---

## Export types

| `type` | Domain gate (after reports where applicable) |
|--------|-----------------------------------------------|
| `cases` | `cases.view` |
| `clients` | `clients.view` |
| `employees` | `employees.view` |
| `tasks` | `tasks.view` |
| `dak` | `dak.view` |
| `accounts` | `accounts.view` |
| `expenses` | `expenses.view` |
| `appointments` | `appointments.view` |
| `fees-outstanding` | accounts-related |
| `attendance` | HRMS perms (see above) |

---

## Key files

| Layer | Path |
|-------|------|
| Page | [`app/(portal)/reports/page.tsx`](../../app/(portal)/reports/page.tsx) |
| UI | [`features/reports/components/reports-page.tsx`](../../features/reports/components/reports-page.tsx) |
| API | [`app/api/exports/route.ts`](../../app/api/exports/route.ts) |

---

## Cross-module links

Read-only across [Clients](./clients_flow.plan.md), [Cases](./cases_flow.plan.md), [Accounts](./accounts_flow.plan.md), [Expenses](./expenses_flow.plan.md), [Appointments](./appointments_flow.plan.md), [Tasks](./tasks_flow.plan.md), [Postal](./postal_flow.plan.md), [Employees](./employees_flow.plan.md), [HRMS](./hrms_flow.plan.md).
