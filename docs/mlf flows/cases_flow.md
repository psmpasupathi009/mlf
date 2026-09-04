# Cases flow (`/cases`)

## Core principle: matter pipeline with dual client link

A **case** (`CSE`) always belongs to an existing **client** (`CLI`). Staff run full CRUD, status pipeline, filing checklist, and hearings. Clients see **only their own** cases. Consultations can become enquiry cases via appointment **convert-case** ([appointments](./appointments_flow.md)).

```mermaid
flowchart TD
  subgraph entry [Entry]
    list["/cases"]
    deep["/cases?new=1"]
    fromClient["/cases?clientUnitId=CLI&new=1"]
    convert["POST appointments/.../convert-case"]
  end

  subgraph create [Create]
    dialog["CaseFormDialog"]
    post["POST /api/cases"]
    zod["createCaseSchema"]
    id["nextUnitId case → CSE"]
    db["Prisma Case dual FK Client"]
  end

  subgraph after [Lifecycle]
    status["PATCH .../status"]
    check["PATCH .../checklist"]
    hrg["POST .../hearings → HRG"]
    adj["POST hearings/.../adjourn"]
    docs["Documents panel"]
    fees["GET accounts?caseUnitId"]
  end

  list --> dialog
  deep --> dialog
  fromClient --> dialog
  convert --> db
  dialog --> post --> zod --> id --> db
  db --> status
  db --> check
  db --> hrg --> adj
  db --> docs
  db --> fees
```

---

## Permissions / nav

| Gate | Value |
|------|--------|
| Nav | `cases.view`, module `cases` (staff + client) |
| List / detail | `cases.view` (+ client scope) |
| Create | `cases.create` (staff) |
| Edit / status / checklist / hearings | `cases.edit` |
| Case CSV import | `cases.upload` |
| Hearing CSV import | `cases.edit` |

---

## Staff vs client

| Action | Staff | Client |
|--------|-------|--------|
| List all / filter / board | Yes | Own `clientUnitId` only |
| Create / edit / status / checklist | Yes | No |
| Hearings / adjourn | Yes | View on detail (scoped) |
| Upload docs on case | Yes | Via [documents](./documents_flow.md) / allowed types |
| Convert from appointment | Yes | No |

API forces client filter via `requireClientUnitId` + `isClientOnlyUser` in [`app/api/cases/route.ts`](../../app/api/cases/route.ts).

---

## Action catalog

| Action | How | API |
|--------|-----|-----|
| List / filters / board | `/cases` | `GET /api/cases?...` (`view=board` raises page size) |
| Open create | **New case**, `?new=1`, or from client | — |
| Create | `CaseFormDialog` — client, court cascade, case type, primary advocate, **required case fee (₹)**; default status **enquiry** | `POST /api/cases` |
| Detail | `/cases/[unitId]` | `GET /api/cases/[unitId]` |
| Edit fields | Form dialog | `PATCH /api/cases/[unitId]` |
| Status transition | Pipeline UI | `PATCH /api/cases/[unitId]/status` → `canTransitionStatus` |
| Filing checklist | Detail | `PATCH /api/cases/[unitId]/checklist` |
| Add hearing | Detail | `POST /api/cases/[unitId]/hearings` → sets `nextHearingAt` |
| Adjourn | Hearing action | `POST /api/hearings/[unitId]/adjourn` → new `HRG` |
| Fee snippet | Detail | `GET /api/accounts?caseUnitId=CSE-…` |
| Import cases / hearings | Import dialogs | `POST /api/cases/import`, `/api/hearings/import` |
| Advocates picker | Form | `GET /api/advocates` |

**ID prefixes:** `CSE` (case), `HRG` (hearing).

---

## Create path (line by line)

1. Page [`app/(portal)/cases/page.tsx`](../../app/(portal)/cases/page.tsx) — `cases.view`; create needs `cases.create`.
2. [`CaseFormDialog`](../../features/cases/components/case-form-dialog.tsx) requires existing client (picker can create client inline — see [clients](./clients_flow.md)).
3. Court / location cascade, case type, primary advocate mobile, optional case number uniqueness.
4. `POST /api/cases` → Zod → verify client exists → `nextUnitId("case")` → create with dual `clientId` + `clientUnitId` → audit → may notify advocates.
5. Toast often points to upload docs on detail.

```mermaid
sequenceDiagram
  participant UI as CaseFormDialog
  participant API as POST_api_cases
  participant DB as Case

  UI->>API: clientUnitId court advocates ...
  API->>API: Zod + client exists
  API->>API: nextUnitId case
  API->>DB: create CSE dual Client
  API->>API: writeAudit notify
  API-->>UI: unitId CSE-xxxxx
```

---

## Status, checklist, hearings

**Pipeline** rules live in [`config/company/case-pipeline.ts`](../../config/company/case-pipeline.ts). Illegal transitions return 400. New cases (and convert-case) start at **enquiry**.

| From (examples) | Allowed next (via `canTransitionStatus`) |
|-----------------|------------------------------------------|
| `enquiry` | `engaged`, `withdrawn` |
| `engaged` | `pre_filing`, `enquiry`, `withdrawn` |
| `withdrawn` | `archived`, `enquiry` |
| Open statuses | Clerks can jump to `withdrawn` / `transferred` per pipeline helpers |

Full graph and labels: same config file. UI uses short labels (Enquiry, Engaged, …).

**Hearings:**

- Create updates `Case.nextHearingAt`.
- May notify staff in-app; client SMS eligibility uses `smsConsent`.
- **Adjourn** keeps history on old `HRG` and creates a replacement.
- New/imported hearings join the **pending SMS list** (`smsSentAt` null, upcoming date). At `HEARING_SMS_TIME_IST` the cron drains that list (SMS + client in-app); hearing calendar date does not drive send day. Day board / cron details: [day board](./day_board_flow.md).

```text
/cases  -->  POST /api/cases { clientUnitId, court, advocates }
        -->  GET /cases/CSE-xxxxx
        -->  PATCH .../status
        -->  POST .../hearings  -->  HRG + nextHearingAt
        -->  POST /api/hearings/HRG-xxxxx/adjourn
```

---

## State / rules

| Rule | Behavior |
|------|----------|
| Client parent | Required dual `clientId` + `clientUnitId` |
| Default status | `enquiry` on create and convert-case |
| Client list scope | Own `clientUnitId` only (`requireClientUnitId`) |
| Hearing SMS | Pending list @ `HEARING_SMS_TIME_IST`; `smsConsent`; once per `Hearing` via `smsSentAt` |
---

## Convert-case inbound

Staff on an appointment with a linked client: `POST /api/appointments/[unitId]/convert-case` creates an **enquiry** case and dual-links the appointment. Requires cases + appointments modules and `appointments.edit` or `cases.create`. Full path: [appointments](./appointments_flow.md).

---

## Key files

| Layer | Path |
|-------|------|
| List / detail pages | [`app/(portal)/cases/`](../../app/(portal)/cases/) |
| List / form / detail UI | [`features/cases/components/`](../../features/cases/components/) |
| Pipeline | [`config/company/case-pipeline.ts`](../../config/company/case-pipeline.ts) |
| Filters / serialize | [`features/cases/server/filters.ts`](../../features/cases/server/filters.ts), [`serialize.ts`](../../features/cases/server/serialize.ts) |
| API | [`app/api/cases/route.ts`](../../app/api/cases/route.ts), [`[unitId]/`](../../app/api/cases/[unitId]/) |
| Hearings adjourn | [`app/api/hearings/[unitId]/adjourn/route.ts`](../../app/api/hearings/[unitId]/adjourn/route.ts) |
| Zod | [`lib/validations/cases.schema.ts`](../../lib/validations/cases.schema.ts) |
| Convert | [`app/api/appointments/[unitId]/convert-case/route.ts`](../../app/api/appointments/[unitId]/convert-case/route.ts) |

---

## Cross-module links

| Module | Link |
|--------|------|
| [Clients](./clients_flow.md) | Required parent `CLI` |
| [Documents](./documents_flow.md) | Case parent uploads |
| [Accounts](./accounts_flow.md) | Required case fee; rollup + Paid/Partial/Unpaid; waivers (sub_admin requests → admin approves) |
| [Day board](./day_board_flow.md) | Hearings for IST day + SMS |
| [Tasks](./tasks_flow.md) / [Postal](./postal_flow.md) | Soft `caseUnitId` |
| [Court roster](./court_roster_flow.md) | Who appears / default courts |
| [Appointments](./appointments_flow.md) | convert-case → enquiry **requires agreedFee** |
