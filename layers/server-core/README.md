# Server core

Select Server core on its own for the API helpers below, or get it automatically when another module requires it.

- Server utils: `success()`, `successPaginated()`, `apiError()` and `zodErrorToFieldErrors()`
  (`server/utils/apiResponse.ts`), `reportServerError()`.
- Client helpers: `apiRequest`, `useAPI`, `parseApiError`, `useRequestState`.
- Shared pagination helpers and the API envelope types (`types/api.ts`).
- Serves the `/api` health check. The optional Web Security layer adds the default limit of 150 requests per minute to `/api/**`.

Other layers import these as `#layers/server-core/...`. This module needs no bindings or env keys.
