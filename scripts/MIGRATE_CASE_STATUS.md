# Case status migration (one-time)

After deploying the case lifecycle pipeline, map legacy statuses once:

```bash
npx tsx scripts/migrate-case-status.ts
```

- `pending` → `pre_filing`
- `listed` → `active`

Safe to re-run (already-migrated rows are unchanged). Requires `DATABASE_URL` in `.env`.
