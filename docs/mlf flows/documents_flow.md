---
name: Documents Flow
overview: Document upload/download for cases, clients, and expense bills. Clients use dedicated `/documents` nav; staff attach from detail panels. Files stored in Cloudinary (legacy local uploads still readable).
---

# Documents flow (`/documents` + panels)

## Core principle: files live outside Mongo; metadata is `DOC`

Bytes are never stored in Mongo. Upload creates a `Document` (`DOC`) with `fileKey` (Cloudinary `public_id`; legacy local `uploads/` still readable). Staff upload from **case / client / expense** panels. Clients use sidebar **Documents** only (`clientOnly`).

```mermaid
sequenceDiagram
  participant UI as Upload panel
  participant API as POST_documents
  participant CL as Cloudinary
  participant DB as Document

  UI->>API: multipart file + parent unitId
  API->>API: MIME sniff + compliance limits
  API->>CL: authenticated upload
  API->>DB: fileKey DOC
  UI->>API: GET download
  API->>CL: signed fetch
```

---

## Permissions / nav

| Gate | Value |
|------|--------|
| Client nav | Matters → Documents · `cases.upload` · **clientOnly** |
| Staff `/documents` | Redirect to `/` — use detail panels instead |
| List/upload/delete/download | `requireUser` then perm/ownership by parent (`cases.*` / `accounts.*` / client scope) |
| Office PDFs | `GET /api/office-files/[slug]` · `requireStaffUser` · `private/office-files/` |

Client upload types: `id_proof`, `evidence`, `affidavit`, `other` (`CLIENT_UPLOAD_DOC_TYPES`). Limits: [`config/company/compliance.ts`](../../config/company/compliance.ts).

---

## Staff vs client

| Action | Staff | Client |
|--------|-------|--------|
| Sidebar `/documents` | No (redirect `/`) | Yes |
| Upload on case/client/expense | Yes | Own CLI parent; limited types |
| Download / delete | Per parent perm | Own docs |

---

## Action catalog

| Action | API |
|--------|-----|
| List | `GET /api/documents?...` |
| Upload | `POST /api/documents` (multipart) |
| Delete | `DELETE /api/documents/[unitId]` |
| Download | `GET /api/documents/[unitId]/download` |
| Static office PDF | `GET /api/office-files/[slug]` |

**ID prefix:** `DOC`.

---

## Request path

```text
Staff case/client/expense panel
  -->  FormData POST /api/documents
  -->  MIME sniff + compliance limits
  -->  Cloudinary  -->  Document.fileKey
  -->  GET .../download  -->  signed bytes

Client /documents  -->  same API, types limited, parent = own CLI
```

---

## Key files

| Layer | Path |
|-------|------|
| Client page | [`app/(portal)/documents/page.tsx`](../../app/(portal)/documents/page.tsx) |
| Client UI | [`features/documents/components/client-documents-page.tsx`](../../features/documents/components/client-documents-page.tsx) |
| Panels | [`features/documents/`](../../features/documents/) |
| API | [`app/api/documents/`](../../app/api/documents/) |
| Storage | [`lib/storage`](../../lib/storage), [`lib/cloudinary.ts`](../../lib/cloudinary.ts) |
| Office files | [`app/api/office-files/[slug]/route.ts`](../../app/api/office-files/[slug]/route.ts) |

---

## Cross-module links

[Cases](./cases_flow.plan.md) · [Clients](./clients_flow.plan.md) · [Expenses](./expenses_flow.plan.md)
