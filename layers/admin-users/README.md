# Admin users panel

User management for admins, built on the admin shell.

- The `/admin/users` page: a table of every account with create, edit, delete and bulk-delete dialogs.
- The admin APIs under `/api/admin/users` (list, create, update, lock or unlock, delete, bulk delete);
  the admin server middleware limits them to admins.
- Creating a user and setting a user's password need password sign-in. Without `auth-password`, the page
  hides **Add user** and the password field, and the APIs refuse both with
  `PASSWORD_SIGN_IN_NOT_INSTALLED`. Listing, editing, locking, deleting and the admin toggle work in every
  project. This layer finds the password method through auth (`getSignInMethod('password')` on the server,
  the `password` entry of `auth:login:methods` in the browser) and never imports `auth-password`.
- Its Users entry in the admin sidebar's Users & Sales section and its card on the `/admin` landing page.
- Route builders in `shared/adminUserRoutes.ts` and the admin form schemas in
  `shared/schemas/adminUserSchema.ts`.

No env keys to fill and no follow-up commands; the users table comes from auth.
