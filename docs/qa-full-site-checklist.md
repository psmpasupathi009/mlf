# Full-site QA checklist

Login as admin (or sub_admin where noted). PIN default: `SEED_PIN` / `123456`.

**Auto** = covered by `npm run test:site` (fixtures + vitest + full-audit).  
**Manual** = click through UI once after Auto is green.

## Auth

| Check | Type | Done |
|-------|------|------|
| Login with mobile + PIN | Auto | [ ] |
| Session `/api/auth/me` | Auto | [ ] |
| OTP send / verify / setup PIN | Auto (SKIP live SMS) | [ ] |
| Forgot PIN reset invalidates old sessions | Auto (code) / Manual | [ ] |
| Logout / session-expired | Auto / Manual | [ ] |

## Courts cascade

| Check | Type | Done |
|-------|------|------|
| State list (all India) | Auto + Manual | [ ] |
| Districts for TN | Auto | [ ] |
| Cities for Erode / Gobi | Auto | [ ] |
| Courts for Gobi DM | Auto | [ ] |
| Case / employee form cascade UI | Manual | [ ] |

## Employees / default courts

| Check | Type | Done |
|-------|------|------|
| Employees list | Auto | [ ] |
| PDF roster default courts on advocates | Manual (Employees → edit) | [ ] |
| Default court chip shows city, district, state | Manual | [ ] |

## Clients & cases

| Check | Type | Done |
|-------|------|------|
| Create / list / patch client | Auto | [ ] |
| Client detail page | Auto | [ ] |
| Portal enable status (optional) | Auto | [ ] |
| Create / list / patch case with court | Auto | [ ] |
| Case detail page | Auto | [ ] |
| Add hearing | Auto | [ ] |
| Diary day board | Auto | [ ] |
| Hearing SMS notify (if configured) | Auto / SKIP | [ ] |
| E2E fixtures (Ajith Gobi DM + Surya Erode PD) | Auto (`test:fixtures`) | [ ] |

## Appointments & availability

| Check | Type | Done |
|-------|------|------|
| List / create appointment | Auto | [ ] |
| Convert appointment → case | Auto / SKIP | [ ] |
| Weekly hours / time blocks | Auto | [ ] |
| Court roster board + available advocates | Auto | [ ] |

## Accounts, expenses & documents

| Check | Type | Done |
|-------|------|------|
| Create payment / void | Auto (void SKIP) | [ ] |
| Create expense + bill / patch | Auto (void SKIP) | [ ] |
| Upload / delete document | Auto (delete SKIP) | [ ] |

## HRMS

| Check | Type | Done |
|-------|------|------|
| Check-in / presence | Auto | [ ] |
| Leave request / decide / cancel | Auto (decide/cancel SKIP) | [ ] |
| Office holidays | Auto (GET) | [ ] |

## Office modules

| Check | Type | Done |
|-------|------|------|
| Dak list / create | Auto | [ ] |
| Tasks list / create | Auto | [ ] |
| Reports / exports (all types) | Auto | [ ] |
| Activity log | Auto | [ ] |

## Admin

| Check | Type | Done |
|-------|------|------|
| Employees CRUD / deactivate | Auto (mutate SKIP) | [ ] |
| Permissions matrix | Auto | [ ] |
| Notifications inbox + mark-one-read | Auto | [ ] |
| Profile | Auto | [ ] |

## Portal pages (HTTP load)

| Path | Type | Done |
|------|------|------|
| `/` Home | Auto | [ ] |
| `/clients` `/clients/[id]` `/cases` `/cases/[id]` `/diary` | Auto | [ ] |
| `/appointments` `/availability` `/court-roster` | Auto | [ ] |
| `/accounts` `/expenses` `/hrms` | Auto | [ ] |
| `/dak` `/tasks` `/reports` `/activity` | Auto | [ ] |
| `/employees` `/permissions` `/notifications` `/profile` | Auto | [ ] |
| `/documents` (staff redirect) `/legal/*` | Auto | [ ] |

## How to run Auto suite

```bash
# Dev server must be running on :3000
npm run test:site
# Or step by step:
npm run test:fixtures
npm test
SMOKE_PIN=123456 npm run test:audit
```

Results: `scripts/.audit-results.json`
