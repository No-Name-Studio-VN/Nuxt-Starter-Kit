# Server core

Select Server core on its own for the API helpers below, or get it automatically when another module requires it.

- Server utils: `success()`, `successPaginated()`, `apiError()` and `zodErrorToFieldErrors()`
  (`server/utils/apiResponse.ts`), `reportServerError()`.
- Client helpers: `apiRequest`, `useAPI`, `parseApiError`, `useRequestState`.
- Shared pagination helpers and the API envelope types (`types/api.ts`).
- Rate-limits every `/api/**` route (150 requests per minute) and serves the `/api` health check.

Other layers import these as `#layers/server-core/...`. This module needs no bindings or env keys.
