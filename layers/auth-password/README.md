# Password sign-in

Username and password sign-in for auth, with Cloudflare Turnstile on its forms.

- The `user_passwords` table (`server/db/schema.sqlite.ts`): one row per user who has a password, holding
  the hash. A user without a row has no password. `server/utils/database/userPassword.ts` is the only code
  that reads or writes it (`hasPassword`, `verify`, `set`).
- The `password` sign-in method. It counts 1 for a user with a password and implements `setSecret`, which
  hashes and saves a new password. Other modules set passwords through
  `getSignInMethod('password')?.setSecret` without importing this layer.
- `POST /api/auth/login-password`, `/register-password`, `/forgot-password` and `/reset-password`, and
  `PATCH /api/users/:id/password` to change the signed-in user's password. Sign-in finishes through
  auth's `completeSignIn()` with `method: 'password'`. A refused sign-in, such as a locked account,
  returns to `/auth/login?error=<code>`.
- The `/auth/register`, `/auth/forgot-password` and `/auth/reset-password` pages. The password form in
  auth's `auth:login:methods` slot, and the "Sign up" link in its `auth:login:footer` slot.
- The `auth:login:alternatives` slot inside the password form (`types/extensions.ts`). Entries get the
  typed username (`types/loginAlternatives.ts`). Passkeys use it.
- The `auth_tokens` table and its service (`server/utils/database/authToken.ts`). Register a token kind
  and its lifetime with `registerAuthTokenKind()`. Password reset registers `password_reset`.
- `registerPostRegisterStep()` runs work after a registration creates the account and can choose where
  the new account goes next. Email verification uses it.
- The password reset email, sent through the email layer.

A user without a password, such as one who signed up with OAuth, can set one through forgot-password.

Env keys to fill: `NUXT_TURNSTILE_SITE_KEY` and `NUXT_TURNSTILE_SECRET_KEY`. Configure email delivery in
the email layer.

Follow-up commands: `pnpm db:generate` to record the `user_passwords` and `auth_tokens` tables in your
migrations, then `pnpm deploy:db`.
