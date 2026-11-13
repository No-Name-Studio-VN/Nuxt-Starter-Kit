# Passkeys

Passwordless sign-in with WebAuthn passkeys, through `nuxt-auth-utils` (`auth.webAuthn`) and
SimpleWebAuthn.

- The `credentials` table (`server/db/schema.sqlite.ts`): one row per passkey, with its public key,
  counter and transports.
- `POST /api/webauthn/authenticate` signs a user in with a passkey. Its button is the `passkey` entry of
  auth's `auth:login:alternatives` slot on `/auth/login`.
- `POST /api/webauthn/register` and `/api/webauthn/add-passkey` add a passkey to the signed-in account.
- `GET` and `DELETE /api/users/:id/passkeys` list and remove the signed-in account's passkeys; an account
  without a password cannot remove its last one.
- `PasskeyRegistrationDialog`, a dialog that offers to create a passkey.

Challenges live in KV for 60 seconds under `auth:challenge:`. Passkey sign-in sets the session directly,
so auth's login policies (email verification, second factor) do not run.

No env keys to fill. Follow-up commands: `pnpm db:generate` to record the `credentials` table in your
migrations, then `pnpm deploy:db`.
