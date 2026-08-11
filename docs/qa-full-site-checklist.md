# Full-site QA checklist

Login as admin (or sub_admin where noted). PIN default: `SEED_PIN` / `123456`.

**Auto** = covered by `npm run test:site` (fixtures + vitest + coverage-flow + full-audit).  
**Manual** = click through UI once after Auto is green.

## Auth

| Check | Type | Done |
|-------|------|------|
| Login with mobile + PIN | Auto | [ ] |
| Session `/api/auth/me` | Auto | [ ] |
| OTP send / verify / setup PIN | Auto (SKIP live SMS) | [ ] |
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
| Create / list / patch case with court | Auto | [ ] |
| Add hearing | Auto | [ ] |
| Diary day board | Auto | [ ] |
| Hearing SMS notify (if configured) | Auto / SKIP | [ ] |
| E2E fixtures (Ajith Gobi DM + Surya Erode PD) | Auto (`test:fixtures`) | [ ] |

## Coverage / reassign

| Check | Type | Done |
|-------|------|------|
| Suggest cover from defaultCourts | Auto (`test:coverage-flow`) | [ ] |
| Date-specific **Cover** | Auto | [ ] |
| **Permanent reassign** clears covering | Auto | [ ] |
| Coverage list API + `/coverage` page | Auto | [ ] |
| Leave approve → open coverage (HRMS) | Auto / Manual | [ ] |
| Availability block → open coverage | Auto / Manual | [ ] |
| Resolve dialog: Cover / Cover batch / Dismiss / Adjourn | Manual | [ ] |

## Appointments & availability

| Check | Type | Done |
|-------|------|------|
| List / create appointment | Auto | [ ] |
| Convert appointment → case | Auto | [ ] |
| Weekly hours / time blocks | Auto | [ ] |

## Accounts & documents

| Check | Type | Done |
|-------|------|------|
| Create payment / void | Auto | [ ] |
| Upload / delete document | Auto | [ ] |

## HRMS

| Check | Type | Done |
|-------|------|------|
| Check-in / presence | Auto | [ ] |
| Leave request / decide / cancel | Auto | [ ] |
| Office holidays | Auto | [ ] |

## Office modules

| Check | Type | Done |
|-------|------|------|
| Dak list / create | Auto | [ ] |
| Tasks list / create | Auto | [ ] |
| Expenses page + API | Auto | [ ] |
| Reports / exports | Auto | [ ] |

## Admin

| Check | Type | Done |
|-------|------|------|
| Employees CRUD / deactivate | Auto | [ ] |
| Permissions matrix | Auto | [ ] |
| Notifications inbox + SSE | Auto | [ ] |
| Profile | Auto | [ ] |

## Portal pages (HTTP load)

| Path | Type | Done |
|------|------|------|
| `/` Home | Auto | [ ] |
| `/clients` `/cases` `/diary` | Auto | [ ] |
| `/coverage` | Auto | [ ] |
| `/appointments` `/availability` | Auto | [ ] |
| `/accounts` `/expenses` `/hrms` | Auto | [ ] |
| `/dak` `/tasks` `/reports` | Auto | [ ] |
| `/employees` `/permissions` `/notifications` `/profile` | Auto | [ ] |

## How to run Auto suite

```bash
# Dev server must be running on :3000
npm run test:site
# Or step by step:
npm run test:fixtures
npm test
npm run test:coverage-flow
SMOKE_PIN=123456 npm run test:audit
```

Results: `scripts/.audit-results.json`
