# Feature flags

OpenFeature flags stored in D1 and served from KV, with an admin panel built on the admin shell.

- The `feature_flags` and `feature_flag_audit_log` tables (`server/db/schema.sqlite.ts`); every write
  syncs the flags to the `KV` namespace and records who changed what.
- A KV-backed OpenFeature provider and `evaluateFlag()` / `getAllFlags()` (`server/utils/featureFlags.ts`).
- `GET /api/flags` and `useFeatureFlags()`, which also hands the flags to the sidebar guards.
- The `/admin/feature-flags` page and the admin APIs under `/api/admin/feature-flags`, limited to admins
  by the admin server middleware; its admin sidebar entry and its card on the `/admin` landing page.
- A seed task that creates the default flags whenever the admin seed runs.

No env keys to fill. Follow-up commands: `pnpm db:generate` to record the flag tables in your migrations,
then `pnpm deploy:db`; `pnpm db:seed` creates the default flags along with the admin account.
