# Email verification

Makes new password accounts confirm their email address before they can sign in.

- The `email-verification` login policy (order 100): a password sign-in on an unverified account
  stops at `/auth/verify-email` before the account lock and second factor run.
- The `email-verification` post-register step: a password registration emails a 24-hour
  verification link and lands on `/auth/verify-email`.
- `GET /api/auth/verify-email?token=` (the link in the email) and `POST /api/auth/resend-verification`.
- The `/auth/verify-email` notice page, which only guests can open.

The `email_verified` column and the verification tokens stay in auth's tables; OAuth, One Tap and
passkey sign-in do not check it. Emails go out through auth's Resend setup.

No env keys to fill beyond auth's `NUXT_RESEND_API_KEY` and `NUXT_RESEND_FROM_EMAIL`. No follow-up commands.
