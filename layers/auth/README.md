# Authentication

Accounts and sessions through `nuxt-auth-utils`, with Cloudflare Turnstile on the sign-in forms.

- Password sign-in and registration, password reset, Google, GitHub and Discord OAuth (popup or
  redirect). Google One Tap is available but not enabled by default.
- The `users`, `auth_tokens`, `user_lock_screen` and `oauth_accounts` tables
  (`server/db/schema.sqlite.ts`), their services under `server/utils/database/`, and the profile,
  password, lock-screen and account-deletion APIs under `/api/users/:id`.
- The account pages (`/auth/**`), the `auth` and `guest` route middleware, and the dashboard layout with its sidebar.

Extension points for modules that require auth:

- Server registries: `registerLoginPolicy()` adds a check between the password check and the session
  (auth's account lock runs at order 150; layers can register before or after it);
  `registerPostRegisterStep()` runs after a password registration;
  `registerOAuthLinkPolicy()` can veto email-based auto-linking; `registerEmailChangedHook()`
  runs after a changed email is saved and verification is reset; and `registerOnboardingStep()`
  determines which onboarding steps apply. Register them from a Nitro plugin.
- `registerSignInMethodSource()` adds a database-backed sign-in method to account removal guards.
  Its `count(userId, excludeId?)` returns a scalar SQL count, excluding the credential being removed
  when supplied. The count is evaluated inside the DELETE, and `/api/users/:id` exposes the total
  from registered sources as `contributedSignInMethodCount`, excluding passwords and OAuth accounts.
- Nav menus `sidebar` (contexts, sections and items) and `userMenu`, through `registerNavItem()`.
  Their guards read a context (today, flag values) that an app plugin can provide under
  `SIDEBAR_GUARD_CONTEXT_KEY` (`app/constants/sidebar.ts`); without one, the flag set is empty.
- Extension slots `auth:login:steps` (replaces the password form when its id matches `?step=`),
  `auth:login:alternatives` (other sign-in buttons) and `sidebar:footer`, through `registerExtension()`.
  The props and events they receive are typed in `types/loginSteps.ts`.
- Extension slots `settings:profile:sections` and `settings:security:sections` add sections to
  their respective settings pages. Register with `registerExtension(slot, { id, order, component })`
  in an app plugin. Section components receive `SettingsSectionProps` from `types/settings.ts`:
  the current `profile` (`UserProfileModel`) and `refresh()` (`Promise<void>`) to reload it after saving.

Env keys to fill: `NUXT_APP_SECRET` (at least 32 characters; generate with `openssl rand -base64 32`),
the Turnstile site and secret keys, `NUXT_RESEND_API_KEY` and `NUXT_RESEND_FROM_EMAIL`, and the client
IDs and secrets for whichever OAuth providers you enable.

## Enabling Google One Tap

The layer ships the prompt and credential endpoint, but does not mount the prompt or declare its
client ID in runtime config. To enable it:

1. In Google Cloud, authorize your site's origin on a Web application OAuth client.
2. Declare `googleOneTapClientId: ''` under `runtimeConfig.public` in your app's `nuxt.config.ts`,
   then set `NUXT_PUBLIC_GOOGLE_ONE_TAP_CLIENT_ID` to the client ID.
   `NUXT_OAUTH_GOOGLE_CLIENT_ID` configures the separate popup/redirect flow and does not enable One Tap.
3. Mount `<AuthGoogleOneTapPrompt />` in a page or layout where signed-out users should see it,
   such as the sign-in page.

## Extending onboarding

Register an onboarding step twice, using the same unique `id` in both registries:

1. In a Nitro plugin, call `registerOnboardingStep({ id, order, isApplicable })` from
   `#layers/auth/server/utils/onboardingSteps`. `isApplicable(user)` determines who sees the step;
   `order` sets its position. Completed IDs are stored server-side, so users resume across devices.
2. In an app plugin, call `registerExtension('onboarding:steps', { id, order, component })`.
   Import `OnboardingStepProps` and `OnboardingStepEmits` from `#layers/auth/types/onboarding` for
   the component contract (`user`, optional `suggestedUsername`, `done`, `back`). Supply a heading
   for the wizard to focus, and emit `done` only after saving any step-specific data. The wizard
   records completion for you. `back` is optional and returns to a step visited in this visit.
   Applicable steps without a client component are skipped and logged in development.

See `server/plugins/onboarding-steps.ts`, `app/plugins/onboarding-steps.ts`, and
`app/components/onboarding/PreferencesStep.vue` for the built-in example.

To add a card on the welcome screen, register
`registerExtension('onboarding:welcome:actions', { id, order, component })` in an app plugin.
Cards are sorted by `order` and appear with staggered motion. Use
`OnboardingWelcomeActionProps`: honor `disabled`, and call `finish('/your-app-route')` if the
card opens another page. This completes onboarding and refreshes the session before navigation.
`SecureAccountAction.vue` shows the pattern.

## Adding an OAuth provider

1. Add one `registerOAuthProvider()` entry in `server/utils/oauthProviders.ts`, or register it from
   an app's Nitro plugin. Use a unique URL-safe `id`, a display `name` and a plain-string `icon` key.
   `createHandler` wraps the matching `defineOAuth…EventHandler`, requests the needed scopes and
   passes a mapped `OAuthProfile` to `onProfile`. Unknown icon keys get a generic key icon.
2. Declare empty `runtimeConfig.oauth.<id>.clientId` and `clientSecret` defaults, check both in
   `isEnabled`, and add `NUXT_OAUTH_<PROVIDER>_CLIENT_ID` and `NUXT_OAUTH_<PROVIDER>_CLIENT_SECRET`
   to `.env.example` and the module's `env` list. In the provider's console, allow the callback
   URL `https://<your-host>/api/auth/<id>`. The callback, popup URL endpoint and provider picker
   all use the registry; they need no per-provider changes.
3. Map the stable provider account ID, name, optional avatar and the email exactly as returned
   (or `''` if absent). Set `emailVerified` only when the provider confirms verification of **that
   address**. Set `emailAuthoritative` only when its verification establishes current control of
   the mailbox, not merely that the address was verified in the past. Default to `false`/`false`
   if unsure: such a profile will never auto-link by email. A missing email always has both flags
   false. The shipped entries show Google Gmail/Workspace authority, GitHub primary email lookup,
   and Discord's verified email claim.

### How OAuth accounts are linked

An existing link signs in by provider account ID, even if the provider email changed or is missing.
Without a link, email auto-linking requires both `emailVerified` and `emailAuthoritative` from the
provider, exactly one case-insensitive local email match, a verified local email, no other link for
that provider on the account, and approval from every link policy. Admin accounts and accounts
with 2FA enabled refuse auto-linking, but can connect providers while signed in from Settings →
Security. 2FA applies only to password sign-in; connected accounts use the provider's security.

- `oauth-email-in-use`: the email is already in use and the match is ambiguous, untrusted,
  unverified locally, or refused by a link policy. Sign in with an existing method to connect it.
- `oauth-provider-conflict`: the matching account already has a different account connected for
  this provider.
- `oauth-email-missing`: the provider shared no email and no existing link could be used.

When upgrading from `nuxt-auth-utils` 0.5, set a stable `NUXT_APP_SECRET` in each deployment and
remove `NUXT_SESSION_PASSWORD`. Existing sessions cannot be read by 0.6, so users must sign in once.
The new cookie is `nuxt-auth-session`; it expires 30 days after its last write, not its last read.
Stored password hashes don't need to change.

Follow-up commands: `pnpm db:generate` to create the auth tables' migrations, then `pnpm deploy:db`.
