# KV storage

Internal module that enables NuxtHub KV and provides the `useKV()` server utility
(`server/utils/kv.ts`).

Bindings: the `KV` namespace in `wrangler.jsonc`. No env keys to fill for the default driver.

To switch to another unstorage driver, override `hub.kv` in the root `nuxt.config.ts`. For Redis,
install `ioredis` and set `REDIS_URL`:

```ts
export default defineNuxtConfig({
  hub: { kv: { driver: 'redis', url: process.env.REDIS_URL } },
});
```
