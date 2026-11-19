# Admin

The admin area shell that the admin modules plug into.

- The `admin` route middleware and the server middleware that limits `/api/admin/**` to admins, except
  the exact `POST /api/admin/seed` endpoint, which authenticates with its seed secret.
- The `/admin` landing page (the `adminCards` menu), the admin sidebar context (Overview, Users & Sales,
  System) and the Admin entry in the account menu. `DataTable` for the admin screens.
- `shouldGrantAdmin()` in `server/utils/adminAccess.ts`, which decides who becomes an admin.
- The `db:seed` task (`server/tasks/db/seed.ts`) and `POST /api/admin/seed`. Both run `seedDatabase()`
  (`server/utils/database/seed.ts`), which runs every registered seed task. The HTTP endpoint does not
  require an admin session: send the configured `NUXT_SEED_SECRET` as `x-seed-secret` or
  `Authorization: Bearer <secret>` (`x-seed-secret` wins if both are present). It returns 503 if the
  seed secret is not configured and 401 for a missing or wrong secret. No seed work runs on these
  failures. Other admin paths and methods still require an admin session.

## Choose your first admin

Nobody is an admin until you fill in `shouldGrantAdmin()`. It runs after every successful sign-in, with
any sign-in method, and gets what the sign-in proved. When it returns `true`, the user becomes an admin
before the session is written. Match on something the user cannot change, such as a GitHub account id:

```ts
export function shouldGrantAdmin(signIn: SignInEvidence): boolean {
  return signIn.oauth?.provider === 'github' && signIn.oauth.providerAccountId === '1234567';
}
```

Don't match on `signIn.user.email` alone, because users can change their email address. Returning
`false` never removes an admin. Once one admin exists, promote or demote others from the users panel.

If no admin can sign in, promote an account in the deployed D1 database directly, the same way
`pnpm deploy:db` reaches it. Replace `<username>` with the account's username:

```sh
pnpm exec wrangler d1 execute DB --remote --command "UPDATE users SET is_admin = 1 WHERE username = '<username>'"
```

## Extension points

- Nav menu `adminCards` (landing-page cards), through `registerNavItem()`. Admin pages add sidebar items
  to the `admin.*` sections.
- `registerSeedTask()` adds work to the seed (`server/utils/seedTasks.ts`). Call it from a Nitro plugin.
  A task's counts land under its `key` in the seed response and are logged with its `label`. The id and
  the key must be unused.

Env keys to fill: `NUXT_SEED_SECRET`. Leave it empty to turn off the HTTP seed endpoint when you don't
need it, and treat it as a privileged credential when you set it.

Follow-up commands: `pnpm db:seed` with the dev server running, to run the seed tasks. It runs the local
Nitro task directly, not the HTTP endpoint.
