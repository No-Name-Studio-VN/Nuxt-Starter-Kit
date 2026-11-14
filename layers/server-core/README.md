# Server core

Internal module pulled in by every server module; it is never picked on its own.

- Registers `@nuxthub/core` with the `KV` and `CACHE` namespaces (`hub.kv`, `hub.cache`).
- Server utils: `success()`, `successPaginated()`, `apiError()` and `zodErrorToFieldErrors()`
  (`server/utils/apiResponse.ts`), `useKV()`, `reportServerError()`.
- Client helpers: `apiRequest`, `useAPI`, `parseApiError`, `useRequestState`.
- Shared pagination helpers and the API envelope types (`types/api.ts`).
- Rate-limits every `/api/**` route (150 requests per minute) and serves the `/api` health check.

Other layers import these as `#layers/server-core/...`.

Bindings: `KV` and `CACHE` KV namespaces in `wrangler.jsonc`. No env keys to fill.
