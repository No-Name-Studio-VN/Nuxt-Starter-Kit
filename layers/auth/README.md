# Authentication

Accounts and sessions through `nuxt-auth-utils`, with Cloudflare Turnstile on the sign-in forms.

- Password sign-in and registration, password reset, Google and GitHub OAuth (popup or redirect) and
  Google One Tap.
- The `users`, `auth_tokens`, `user_lock_screen` and `oauth_accounts` tables
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
- Extension slots `auth:login:steps` (replaces the password form when its id matches `?step=`),
  `auth:login:alternatives` (other sign-in buttons) and `sidebar:footer`, through `registerExtension()`.
  The props and events they receive are typed in `types/loginSteps.ts`.

Env keys to fill: `NUXT_SESSION_PASSWORD` (at least 32 characters), `CSRF_SECRET`, the Turnstile site and
secret keys, `NUXT_RESEND_API_KEY` and `NUXT_RESEND_FROM_EMAIL`, and the Google and GitHub OAuth client
IDs and secrets.

Follow-up commands: `pnpm db:generate` to create the auth tables' migrations, then `pnpm deploy:db`.
