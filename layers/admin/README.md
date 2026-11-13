# Admin

The admin area shell that the admin modules plug into.

- The `admin` route middleware and the server middleware that limits `/api/admin/**` to admins.
- The `/admin` landing page (the `adminCards` menu), the admin sidebar context (Overview, Users & Sales,
  System) and the Admin entry in the account menu. `DataTable` for the admin screens.
- The `db:admin-creation` task (`server/tasks/db/admin-creation.ts`) and `POST /api/admin/seed` (admins
  only, plus the seed secret as `x-seed-secret` or a bearer token). Both run `seedDatabase()`
  (`server/utils/database/seed.ts`): it creates the `admin` account, then runs every registered seed task.

Extension points for modules that require admin:

- Nav menu `adminCards` (landing-page cards), through `registerNavItem()`; admin pages add sidebar items
  to the `admin.*` sections.
- `registerSeedTask()` adds work to the seed (`server/utils/seedTasks.ts`); call it from a Nitro plugin.
  A task's counts land under its `key` in the seed response and are logged with its `label`; the id and
  the key must be unused, and `admin` is reserved.

Env keys to fill: `NUXT_DEFAULT_ADMIN_PASSWORD` (the seeded admin's password) and `NUXT_SEED_SECRET`.

Follow-up commands: `pnpm db:seed` with the dev server running, to create the admin account.
