# Server core

Internal module pulled in by every server module; it is never picked on its own.

- Server utils: `success()`, `successPaginated()`, `apiError()` and `zodErrorToFieldErrors()`
  (`server/utils/apiResponse.ts`), `reportServerError()`.
- Client helpers: `apiRequest`, `useAPI`, `parseApiError`, `useRequestState`.
- Shared pagination helpers and the API envelope types (`types/api.ts`).
- Rate-limits every `/api/**` route (150 requests per minute) and serves the `/api` health check.

Other layers import these as `#layers/server-core/...`. This module needs no bindings or env keys.
