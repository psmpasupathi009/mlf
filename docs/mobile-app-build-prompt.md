# MLF Mobile App — Build Plan & Agent Prompt

Use this document as the **single source of truth** when building the Expo React Native staff app. Copy the [Agent prompt](#agent-prompt-copy-paste) section into a new chat when continuing implementation.

---

## Goal

Build an **Expo (React Native)** staff app for **Android + iOS** that uses the **same MLF website APIs and MongoDB** (via the existing Next.js backend). Do **not** give the app a direct database connection.

| Layer | What mobile uses |
|--------|------------------|
| Backend | Existing Next.js `/api/*` on the deployed site (or local `http://localhost:3000` for dev) |
| Database | Same MongoDB Atlas — **only through APIs** |
| Auth | Same mobile + 6-digit PIN (+ OTP setup / forgot PIN) |
| Platforms | Android and iOS from one Expo codebase |

**Project path (expected):** `/Users/psmpasu/mlf-mobile` (or `/Users/psmpasu/projects/mlf_mobile`)  
**Website path:** `/Users/psmpasu/projects/mlf`

**Stack:** Expo SDK 57 + TypeScript + Expo Router · `expo-secure-store` · TanStack Query · Zustand · Zod

---

## Website setup already done (backend)

These changes live in the web repo so native clients can authenticate without scraping cookies:

1. **`POST /api/auth/login`** — JSON success includes `accessToken` (+ `user`).
2. **`POST /api/auth/setup-pin`** — same.
3. **`POST /api/auth/forgot-pin/reset`** — same.
4. All authenticated APIs already accept:
   - `Authorization: Bearer <accessToken>`, or
   - Cookie `mlf_access` (web only).

**You do not need a separate mobile database or mobile-only API tree.**

**Canonical step machine:** Copy from web [`lib/auth/login-flow.ts`](../lib/auth/login-flow.ts) and [`features/auth/components/login-form.tsx`](../features/auth/components/login-form.tsx). Types: `LoginStep`, `CheckMobileStatus`, `AUTH_API`, `AUTH_TOKEN_ENDPOINTS`.

| `LoginStep` (UI state) | Trigger | API call(s) | Persist token? |
|------------------------|---------|-------------|----------------|
| `phone` | User submits mobile | `POST check-mobile` | — |
| `pin` | `status: pin` | `POST login` | Yes — save `accessToken` |
| `otp_setup` | `status: otp_required` | `POST send-otp` `{ purpose: "setup" }` | — |
| `setup_pin` | OTP verified | `POST verify-otp` → `POST setup-pin` | Yes |
| `otp_forgot` | User taps Forgot PIN | `POST send-otp` `{ purpose: "forgot_pin" }` | — |
| `reset_pin` | OTP verified | `POST verify-otp` → `POST forgot-pin/reset` | Yes |

Only `login`, `setup-pin`, and `forgot-pin/reset` return `accessToken`. Store it in SecureStore after any of those succeed.

### Deploy checklist (website)

Before the phone can talk to production:

- [ ] Deploy the website (Vercel) with the `accessToken` auth responses.
- [ ] Env vars set: `DATABASE_URL`, `JWT_SECRET`, `TWO_FACTOR_*`, `ADMIN_MOBILE`, `CRON_SECRET`, `ALLOWED_ORIGINS` (web origins only).
- [ ] Note the public base URL, e.g. `https://your-mlf-app.vercel.app`.
- [ ] App config: `EXPO_PUBLIC_API_BASE_URL` = that URL (no trailing slash).

### Dev against local website

1. Run website: `cd /Users/psmpasu/projects/mlf && npm run dev`
2. Android emulator → use `http://10.0.2.2:3000` (auto-mapped from localhost in app env helper)
3. iOS simulator → use `http://localhost:3000`
4. Physical device → use your Mac’s LAN IP, e.g. `http://192.168.x.x:3000` (same Wi‑Fi; allow HTTP cleartext for debug only)

---

## Architecture (mobile)

```text
Expo RN UI
  → ApiClient (fetch)
       Authorization: Bearer <JWT>
  → Next.js /api/*
       Prisma
  → MongoDB Atlas
```

- Store JWT in **expo-secure-store**.
- On **401** → clear token → login screen.
- Respect `user.permissions` (`"module.action"` strings) to show/hide features.
- Prefer polling notifications; do not rely on SSE.
- Never ship `JWT_SECRET`, `DATABASE_URL`, or `CRON_SECRET` in the app.

---

## API contract (shared)

### Envelope

Success:

```json
{ "ok": true, "data": { } }
```

List:

```json
{ "ok": true, "data": [], "meta": { "page": 1, "pageSize": 20, "total": 100 } }
```

Error:

```json
{ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

IDs in the app are **`unitId`** strings (`CLI-00001`, `CSE-00001`, …), never Mongo `_id`.

### Auth flow

1. `POST /api/auth/check-mobile` `{ "mobile": "98XXXXXXXX" }`  
   → `status`: `pin` | `otp_required` | `not_found`
2. If `pin`: `POST /api/auth/login` `{ "mobile", "pin" }`  
   → `{ "ok": true, "data": { "message", "user", "accessToken" } }`
3. If first-time: `send-otp` → `verify-otp` → `setup-pin` (returns `accessToken`)
4. Forgot PIN: `send-otp` (`purpose: "forgot_pin"`) → `verify-otp` → `forgot-pin/reset`
5. Session check: `GET /api/auth/me` with Bearer
6. Logout: clear local token (+ optional `POST /api/auth/logout`)

PIN = 6 digits. OTP = 4 digits (2Factor).

### Auth header on every protected call

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Core endpoints for v1 mobile

| Feature | Endpoints |
|---------|-----------|
| Home | `GET /api/dashboard/summary` |
| Day board | `GET /api/diary?date=YYYY-MM-DD` |
| Clients | `GET/POST /api/clients`, `GET/PATCH /api/clients/[unitId]` |
| Cases | `GET/POST /api/cases`, `GET/PATCH /api/cases/[unitId]`, hearings/status/checklist |
| Appointments | `GET/POST /api/appointments`, availability |
| Tasks | `GET/POST /api/tasks`, `PATCH /api/tasks/[unitId]` |
| Accounts | `GET/POST /api/accounts`, void |
| HRMS | attendance check-in/out, leave, holidays |
| Notifications | list, unread-count, mark read |
| Profile | `GET/PATCH /api/profile`, photo |
| Search | `GET /api/search?q=` |

Full map: [application-flows.md](./application-flows.md).

**On mobile:** all website nav modules are in the staff app (tabs + More). **Still website-first:** CSV import, Excel download, permissions *editor*, court cascade pickers.

---

## Expo app plan (phased)

### Phase 0 — Project shell

- Expo TypeScript + Expo Router app.
- Packages: `expo-secure-store`, `@tanstack/react-query`, `zustand`, `zod`, `date-fns`, `expo-image-picker`, `expo-location`.
- Env: `EXPO_PUBLIC_API_BASE_URL`.
- Folder layout:

```text
src/
  app/                 # Expo Router screens
  core/                # api client, auth storage, theme, env
  features/
    auth/
    home/
    diary/
    clients/
    cases/
    appointments/
    tasks/
    accounts/
    hrms/
    notifications/
    profile/
    search/
  components/ui/
```

### Phase 1 — Auth + shell

- Login / OTP / setup PIN / forgot PIN screens matching website flow.
- Persist `accessToken` in SecureStore; keep `user` (permissions) in Zustand.
- Bottom tabs gated by permissions: Home, Day board, Cases, Clients, More.
- Splash → `/me` → home or login.

### Phase 2 — Field staff core

- Day board (hearings, appointments, tasks for a date).
- Cases list/detail.
- Clients list/detail.
- Appointments list.
- Notifications badge + inbox (poll).
- Global search.

### Phase 3 — Office + HRMS

- Tasks (mark done).
- Accounts (list + summary).
- HRMS check-in/out (GPS), leave request/status, holidays.
- Profile view/edit + photo.

### Phase 4 — Polish

- Offline-friendly empty/error states; pull-to-refresh.
- App icons, splash, store readiness.
- Release builds via EAS: Android App Bundle + iOS Archive.

---

## Website vs mobile responsibilities

| Concern | Website (Next.js) | Mobile (Expo) |
|---------|-------------------|---------------|
| Database | Owns Prisma + Atlas | Never connects |
| Auth tokens | Issues JWT; cookie for web; `accessToken` in JSON for mobile | Stores Bearer token in SecureStore |
| Business rules | Zod + API guards + RBAC | UI only; show errors from API |
| SMS / OTP | 2Factor on server | Just call send/verify APIs |
| Cron SMS | Vercel cron | Not used |
| File uploads | `/api/documents`, profile photo | Multipart with Bearer |

**No extra mobile DB.** Optional later: push notifications (FCM/APNs) → new website endpoint to register device tokens — **not required for v1**.

---

## Agent prompt (copy-paste)

Paste into Cursor when building the mobile app:

```text
You are building MLF Mobile — an Expo React Native app (Android + iOS) for law-firm staff.

CONTEXT
- Website (API + DB): /Users/psmpasu/projects/mlf (Next.js + Prisma + MongoDB Atlas)
- Mobile app: /Users/psmpasu/mlf-mobile
- Plan doc: /Users/psmpasu/projects/mlf/docs/mobile-app-build-prompt.md
- Flows/API map: /Users/psmpasu/projects/mlf/docs/application-flows.md
- Expo docs: https://docs.expo.dev/versions/v57.0.0/

RULES
1. Call existing HTTPS /api/* only. Never connect to MongoDB from the app.
2. Auth: same mobile + 6-digit PIN (+ OTP). After login/setup/reset, read data.accessToken and send Authorization: Bearer on all API calls. Store token in expo-secure-store.
3. API envelope: { ok, data } / { ok: false, error: { code, message } }. Use unitId public IDs.
4. Gate UI with user.permissions ("module.action"). Handle 401 → logout.
5. Support Android and iOS from one codebase. Use EXPO_PUBLIC_API_BASE_URL (emulator/simulator/prod).
6. Match website product language: clients, cases, hearings, day board, appointments, HRMS, etc.
7. Do not invent new backend endpoints unless blocked; prefer existing routes. If a backend change is required, document it and implement in the website repo.
8. Phase order: Auth shell → Day board + Cases + Clients + Appointments + Notifications → Tasks/Accounts/HRMS/Profile → polish.

START
- Inspect existing Expo project structure.
- Implement core ApiClient + auth flow against the website API.
- Then build Phase 1 screens, then Phase 2 features one by one.
- Keep commits/docs minimal unless asked.
```

---

## Quick test plan

1. Website running (local or prod) with latest auth that returns `accessToken`.
2. `npx expo start` → Android emulator and iOS simulator.
3. Login with a real staff mobile + PIN from the portal.
4. Confirm `GET /api/auth/me` and Day board / Cases load with Bearer.
5. Confirm logout clears token and blocks APIs.
6. Confirm a user without a permission cannot open that screen (API still enforces 403).

---

## Related docs

| Doc | Use |
|-----|------|
| [application-flows.md](./application-flows.md) | Feature → API → files |
| [prisma-database.md](./prisma-database.md) | Atlas / Prisma (website only) |
| Website `README.md` | Run/deploy the portal |
| [Expo SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/) | Platform APIs |
