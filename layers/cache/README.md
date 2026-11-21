# Cache storage

Internal module that backs Nitro's `cache` storage with NuxtHub. This is the storage used by
`defineCachedFunction()` and `useStorage('cache')`. Without this module, production cache entries
fall back to per-isolate memory.

Bindings: the `CACHE` namespace in `wrangler.jsonc`. No env keys to fill for the default driver.

To change the driver, override `hub.cache` in the root `nuxt.config.ts`.
