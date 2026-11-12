# Admin users panel

User management for admins, built on the admin shell.

- The `/admin/users` page: a table of every account with create, edit, delete and bulk-delete dialogs.
- The admin APIs under `/api/admin/users` (list, create, update, lock or unlock, delete, bulk delete);
  the admin server middleware limits them to admins.
- Its Users entry in the admin sidebar's Users & Sales section and its card on the `/admin` landing page.
- Route builders in `shared/adminUserRoutes.ts` and the admin form schemas in
  `shared/schemas/adminUserSchema.ts`.

No env keys to fill and no follow-up commands; the users table comes from auth.
