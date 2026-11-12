# Admin

The admin area shell that the admin modules plug into.

- The `admin` route middleware and the server middleware that limits `/api/admin/**` to admins.
- The `/admin` landing page, its sidebar context (Overview, Users & Sales, System) and the Admin entry
  in the account menu. `DataTable` for the admin screens.
- The `db:admin-creation` task and `POST /api/admin/seed` (admins only, plus the seed secret as
  `x-seed-secret` or a bearer token). Both create the `admin` account, then run every registered seed task.

Extension points for modules that require admin:

- Nav menu `adminCards` (landing-page cards), through `registerNavItem()`; admin pages add sidebar items
  to the `admin.*` sections.
- `registerSeedTask()` adds work to the seed (`server/utils/seedTasks.ts`); call it from a Nitro plugin.

Env keys to fill: `NUXT_DEFAULT_ADMIN_PASSWORD` (the seeded admin's password) and `NUXT_SEED_SECRET`.

Follow-up commands: `pnpm db:seed` with the dev server running, to create the admin account.
