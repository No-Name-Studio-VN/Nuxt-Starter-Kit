# Authentication

Accounts and sessions through `nuxt-auth-utils`, with Cloudflare Turnstile on the sign-in forms.

- Password sign-in, registration, and password reset.
- The `users`, `auth_tokens`, `user_lock_screen` tables
  (`server/db/schema.sqlite.ts`), their services under `server/utils/database/`, and the profile,
  password, lock-screen and account-deletion APIs under `/api/users/:id`.
- The account pages (`/auth/**`), the `auth` and `guest` route middleware, and the dashboard layout with its sidebar.

Extension points for modules that require auth:

- Server registries: `registerSignInMethod()` adds a way to sign in and counts the user's credentials for
  it, so removing the last one is refused; `registerLoginPolicy()` adds a check between the proof of
  identity and the session, for every method or only the ones in `methods` (auth's account lock runs at
  order 150 for every method; layers can register before or after it); `registerPostRegisterStep()` runs
  after a password registration. Register them from a Nitro plugin.
- Every sign-in finishes through `completeSignIn()`, which runs the policies, calls the `auth:signed-in`
  Nitro runtime hook with what the sign-in proved, records `lastLoginAt` and writes the session.
- Nav menus `sidebar` (contexts, sections and items) and `userMenu`, through `registerNavItem()`.
  Their guards read a context (today, flag values) that an app plugin can provide under
  `SIDEBAR_GUARD_CONTEXT_KEY` (`app/constants/sidebar.ts`); without one, the flag set is empty.
- Register `auth:login:methods` and `auth:register:methods` entries with `registerExtension()`.
  The pages render entries in order. `types/authMethods.ts` defines the props and events.
- A matching `?step=` renders an `auth:login:steps` entry in place of the login methods.
  The password form renders `auth:login:alternatives` below its submit button. See `types/loginSteps.ts`.

Env keys to fill: `NUXT_SESSION_PASSWORD` (at least 32 characters), `CSRF_SECRET`, the Turnstile site and
secret keys. Configure email delivery in the email layer.

Follow-up commands: `pnpm db:generate` to create the auth tables' migrations, then `pnpm deploy:db`.
