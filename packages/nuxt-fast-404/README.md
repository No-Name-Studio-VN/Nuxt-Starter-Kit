# nuxt-fast-404

`nuxt-fast-404` is an opt-in Nuxt 4 module that returns compact 404 responses before
application server middleware and Vue SSR run for paths that are absent from the production
route manifest.

It is useful when broad scanner traffic or bad links make unknown paths expensive. It does not
block a request before the deployment platform invokes your serverless function or Worker; use
your CDN, WAF, or rate limiting for that layer.

## Installation

```bash
npm install nuxt-fast-404
```

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-fast-404'],
  fast404: {
    cacheMaxAge: 60,
    exclude: ['/runtime-routes/**'],
  },
});
```

## Options

| Option        | Default    | Purpose                                                                               |
| ------------- | ---------- | ------------------------------------------------------------------------------------- |
| `enabled`     | `true`     | Disable the module without removing it from `modules`.                                |
| `apiPrefixes` | `['/api']` | Unknown paths below these prefixes receive compact JSON instead of HTML.              |
| `exclude`     | `[]`       | Rou3 route patterns that must continue through normal Nuxt handling.                  |
| `cacheMaxAge` | `60`       | Public cache lifetime in seconds for `GET` and `HEAD` misses. Use `0` for `no-store`. |

## Behavior and Limits

At build time, the module collects Nuxt pages, aliases, and non-middleware Nitro handlers. Its
prepended `00-fast-404` middleware lets known paths through and responds immediately to the rest.
It handles Nuxt payload URLs, application base URLs, trailing slashes, and Nuxt's default
case-insensitive page routing.

The module is deliberately conservative in a few cases:

- `/__nuxt_error` always passes through so Nuxt can render custom error pages on every Nitro preset.
- A Nuxt catch-all page or an explicit `/**` server handler matches all paths and therefore removes
  the optimization.
- Runtime-added Vue routes and server middleware that intentionally handles arbitrary paths are not
  discoverable at build time. Add those path patterns to `exclude`.
- A short-circuited response bypasses custom `error.vue`, Nuxt plugins, and later server middleware.
  Enable the module only when that behavior is appropriate for unmatched traffic.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

The runtime fixture under `test/fixtures/runtime-app` is used to verify the built Nuxt server path:
unknown requests must not reach `after-fast-404` middleware, while known routes must continue to do so.
