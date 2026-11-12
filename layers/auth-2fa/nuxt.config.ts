import { createResolver } from '@nuxt/kit';

const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  nitro: {
    typescript: {
      tsConfig: {
        // Nitro's generated tsconfig includes server/ and shared/*.d.ts only, so the
        // pending-login field this layer adds to the secure session must be listed.
        include: [resolve('./auth-2fa.d.ts')],
      },
    },
  },
});
