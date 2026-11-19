# Email verification

Makes new password accounts confirm their email address before they can sign in. Requires
`auth-password`.

- The `email-verification` login policy (order 100): a password sign-in on an unverified account
  stops at `/auth/verify-email` before the account lock and second factor run.
- The `email-verification` post-register step, registered with `auth-password`'s
  `registerPostRegisterStep()`: a password registration emails a 24-hour verification link and lands
  on `/auth/verify-email`.
- `GET /api/auth/verify-email?token=` (the link in the email) and `POST /api/auth/resend-verification`.
- The `/auth/verify-email` notice page, which only guests can open.

The `email_verified` column stays in auth's `users` table. The verification tokens live in
`auth-password`'s `auth_tokens` table, as the `email_verification` token kind. OAuth, One Tap and passkey
sign-in do not check it. Emails go out through the email layer.

No env keys to fill beyond the email layer's `NUXT_RESEND_API_KEY` and `NUXT_RESEND_FROM_EMAIL`. No
follow-up commands.
