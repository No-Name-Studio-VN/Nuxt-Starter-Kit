# Passkeys

Passwordless sign-in with WebAuthn passkeys, through `nuxt-auth-utils` (`auth.webAuthn`) and
SimpleWebAuthn. Requires `auth` and `kv` (works alongside `auth-password`, `auth-oauth`, or both).

- The `credentials` table (`server/db/schema.sqlite.ts`): one row per passkey, with its public key,
  counter and transports.
- `POST /api/webauthn/authenticate` signs a user in with a passkey. Its button plugs into
  `auth:login:alternatives` inside the password form when `auth-password` is installed, or renders as
  its own `auth:login:methods` entry on `/auth/login` when `auth-password` is absent.
- `POST /api/webauthn/register` and `/api/webauthn/add-passkey` add a passkey to the signed-in account.
- `GET` and `DELETE /api/users/:id/passkeys` list and remove the signed-in account's passkeys. Deleting
  the account's last way in, counted across every sign-in method, is refused.
- `PasskeyRegistrationDialog`, a dialog that offers to create a passkey.

Challenges live in KV for 60 seconds under `auth:challenge:`. Passkey sign-in finishes through auth's
`completeSignIn()` with `method: 'passkey'`, so the account lock applies. Email verification and the
second factor do not.

No env keys to fill. Follow-up commands: `pnpm db:generate` to record the `credentials` table in your
migrations, then `pnpm deploy:db`.
