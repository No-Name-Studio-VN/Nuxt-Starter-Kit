# Authentication

Accounts and sessions through `nuxt-auth-utils`. Auth has no sign-in method of its own: install
`auth-password`, `auth-oauth`, or both.

- The `users` and `user_lock_screen` tables (`server/db/schema.sqlite.ts`), their services under
  `server/utils/database/`, and the profile, lock-screen and account-deletion APIs under `/api/users/:id`.
  `GET /api/users/me` returns `signInMethods`, the number of ways in each installed method gives the user.
- The `/auth/login` page, which hosts the sign-in methods, and the `/auth` redirect to it.
- The `auth` route middleware and the `guest` middleware. A page for signed-out visitors opts in with
  `definePageMeta({ middleware: ['guest'] })`.
- The account lock: a locked account is refused by every sign-in method and by the API.
- `NavUser` and the guest sign-in buttons, registered into the dashboard slots.

Extension points for sign-in methods and other modules:

- `registerSignInMethod()` adds a way to sign in. Its `countCredentials` counts the user's ways in,
  and `countCredentialsQuery` supplies a scalar SQL predicate for race-safe credential removal. An
  async-only registration counts in the profile, but is not proof for a credential DELETE. A method with a secret
  also implements `setSecret`; other modules find it with `getSignInMethod(id)`.
- `registerLoginPolicy()` adds a check between the proof of identity and the session, for every method or
  only the ones in `methods`. Auth's account lock runs at order 150 for every method and answers with a
  `deny` (`ACCOUNT_LOCKED`). Each method turns a deny into its own response.
- Every sign-in finishes through `completeSignIn()`. It runs the policies, calls the `auth:signed-in`
  Nitro runtime hook with what the sign-in proved, records `lastLoginAt` and writes the session.
- `registerAuthMessages()` adds the texts the login page shows for `?error=` and `?success=` codes.
- Register `auth:login:methods` and `auth:register:methods` entries with `registerExtension()`.
  The pages render entries in order. `types/authMethods.ts` defines the props and events.
  `auth:login:footer` entries render under the methods, for example a sign-up link.
- A matching `?step=` renders an `auth:login:steps` entry in place of the sign-in methods.
  See `types/loginSteps.ts`.
- `settings:security:sections` accepts `SettingsSectionProps` for optional cards; the authenticated
  settings pages are under `/settings/profile` and `/settings/security`.
- `registerOnboardingStep()` adds an ordered server-owned setup step, and `onboarding:steps`
  renders the matching client component. Self-registered accounts are marked pending; completing
  or skipping onboarding clears the flag. `auth:login:remembered` hosts method-owned renderers
  for completed session sign-ins, not pending challenges.
- Nav menu `userMenu`, through `registerNavItem()`.

Set a stable `NUXT_APP_SECRET` in each Worker or other deployment (generate with `openssl rand -base64 32`).
`nuxt-auth-utils` 0.6 no longer uses `NUXT_SESSION_PASSWORD`; upgrading invalidates old sessions and
users must sign in once. There is no old-secret fallback.

Follow-up commands: `pnpm db:generate` to create the auth tables' migrations, then `pnpm deploy:db`.
