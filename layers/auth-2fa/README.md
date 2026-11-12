# Two-factor authentication

A TOTP second factor (authenticator apps) for password sign-in.

- `POST /api/users/:id/2fa/setup`, `/verify` and `DELETE /api/users/:id/2fa/disable` to turn it on
  and off; verifying hands out ten single-use backup codes.
- The `two-factor` login policy (order 200): a password sign-in with 2FA on stops at
  `/auth/login?step=2fa`, and `POST /api/auth/login-2fa` finishes it with a code or a backup code.
- The `2fa` login step (`auth:login:steps`), with its OTP input (`app/components/ui/input-otp`).
- `POST /api/users/:id/lock-screen/validate`, which unlocks the lock screen with a code.

Codes are limited to ten failed attempts, counted on auth's lock-screen row. OAuth, One Tap and
passkey sign-in do not ask for a code.

No env keys to fill.
