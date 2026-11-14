# Admin

The admin area shell that the admin modules plug into.

- The `admin` route middleware and the server middleware that limits `/api/admin/**` to admins, except
  the exact `POST /api/admin/seed` bootstrap endpoint, which authenticates with its seed secret.
- The `/admin` landing page (the `adminCards` menu), the admin sidebar context (Overview, Users & Sales,
  System) and the Admin entry in the account menu. `DataTable` for the admin screens.
- The `db:admin-creation` task (`server/tasks/db/admin-creation.ts`) and `POST /api/admin/seed`. Both run
  `seedDatabase()` (`server/utils/database/seed.ts`): it creates the `admin` account, then runs every
  registered seed task. The HTTP endpoint does not require an existing admin session: supply the
  configured `NUXT_SEED_SECRET` as `x-seed-secret` or `Authorization: Bearer <secret>` (`x-seed-secret`
  takes precedence if both are present). It returns 503 if the seed secret is unconfigured, 401 for a
  missing or incorrect token, and 503 if a valid token is supplied but `NUXT_DEFAULT_ADMIN_PASSWORD`
  is unconfigured. No seed work runs on these failures. Other admin paths and methods still require
  an admin session; `/api/admin/tasks/seed-admin` is not a seed endpoint.

Extension points for modules that require admin:

- Nav menu `adminCards` (landing-page cards), through `registerNavItem()`; admin pages add sidebar items
  to the `admin.*` sections.
- `registerSeedTask()` adds work to the seed (`server/utils/seedTasks.ts`); call it from a Nitro plugin.
  A task's counts land under its `key` in the seed response and are logged with its `label`; the id and
  the key must be unused, and `admin` is reserved.

Env keys to fill: `NUXT_DEFAULT_ADMIN_PASSWORD` (the seeded admin's password) and `NUXT_SEED_SECRET`.

Follow-up commands: `pnpm db:seed` with the dev server running, to create the admin account. This
invokes the local Nitro task directly (not the HTTP endpoint) and requires the default admin password,
not the HTTP seed secret. Treat the HTTP secret as a privileged bootstrap credential; leave
`NUXT_SEED_SECRET` empty to disable the HTTP endpoint when it is not needed.
