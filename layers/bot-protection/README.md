# Bot protection

Add this optional module to require a verification token on bot-sensitive form submissions. It requires `server-core`, but not auth or a database.

```sh
pnpm dlx create-nuxt-saas@latest add bot-protection
```

Turnstile is the default provider. For production, set `NUXT_TURNSTILE_SITE_KEY` at build time and `NUXT_TURNSTILE_SECRET_KEY` in the server environment. On Workers, set the secret as a Worker secret (use `.dev.vars` for local Wrangler runs). `NUXT_PUBLIC_TURNSTILE_SITE_KEY` is also supported as a runtime public override. A production request fails closed if the verifier cannot run. Siteverify must return the request hostname as well as a successful result. In `pnpm dev`, if either key is missing, both use Cloudflare's always-pass test pair. The hostname check is skipped for that pair because Cloudflare reports `localhost` regardless of the actual hostname. Never use the test pair in a live deployment.

## Routes

The password layer marks `POST /api/auth/login-password`, `/api/auth/register-password` and `/api/auth/forgot-password`. The email verification layer also marks `POST /api/auth/resend-verification`. Installing those layers without `bot-protection` leaves the flags inactive.

Add your own paths in `nuxt.config.ts`. The module merges these into Nitro route rules alongside the layer contributions. Both exact paths and `/**` suffix patterns work; match the API path, not the localized URL of the form. `GET` requests are not challenged.

```ts
export default defineNuxtConfig({
  botProtection: {
    provider: 'turnstile',
    routes: ['/api/contact/**'],
  },
  routeRules: {
    '/api/newsletter': { botProtection: { redirect: '/newsletter' } },
  },
});
```

A string in `botProtection.routes` defaults to `botProtection: true`. To send failed URL-encoded form posts back to a page instead of returning JSON, set `botProtection: { redirect: '/your-form' }` in `routeRules`; middleware adds `error=bot-protection` to the redirect URL. Password login and registration use this form of the rule.

In the form, call `const { challenge, pending, headers, reset, errorMessage } = useFormChallenge()` and render `<FormChallenge :challenge="challenge" />`. Disable the submit button and guard submission while `pending` is true. If no challenge module is installed, the component renders nothing, `pending` is false, and `headers()` is empty. If a provider is configured but has no widget, the component shows an unavailable alert and submission stays disabled.

- **Native posts:** Render the component inside the form; its `bot-protection-token` hidden input travels with the URL-encoded body.
- **Fetch:** Pass `headers()` to send `x-bot-protection-token` and call `reset()` in `finally`. The header takes precedence over the form field. Tokens are single-use.

API failures return HTTP 403 with code `BOT_PROTECTION_FAILED`, an English message, and `details.reason` (`missing-token`, `invalid-token`, or `unavailable`). On the client, use `const parsed = parseApiError(error);` and show `errorMessage(parsed) ?? parsed.message` to translate known reasons.

For conditional verification instead of automatic route protection, call `await verifyBotProtection(event)` in the handler. It returns `{ ok: true }` or `{ ok: false, reason }`. Repeated verification on the same request reuses the first result.

## Custom provider

Set `botProtection.provider` to the same ID in your config and both plugins below. Configure the provider at build time so the client widget and server verifier agree. Put the provider's secret in server runtime configuration only, and add any CSP origins the provider needs.

```ts
// server/plugins/bot-provider.ts
import { verifyAcmeChallenge } from '../utils/acmeChallenge';

export default defineNitroPlugin(() => {
  registerBotProtectionProvider('acme', ({ token, event }) =>
    verifyAcmeChallenge(token, event),
  );
});
```

```ts
// app/plugins/bot-widget.ts
import AcmeChallenge from '../components/AcmeChallenge.vue';

export default defineNuxtPlugin(() => {
  registerExtension('form:challenge', { id: 'acme', order: 0, component: AcmeChallenge });
});
```

`verifyAcmeChallenge` is your server-side adapter: resolve to `true` only for a verified token, return `false` for an invalid token, and throw when the provider is unavailable. The widget implements a string `v-model` and clears it on expiry or error. It is remounted after submission so it must clean up its provider widget on unmount.
