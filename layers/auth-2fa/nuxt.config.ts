import { createResolver } from '@nuxt/kit';

const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  // The shadcn input-otp folder has a barrel index.ts that would register as a fake
  // global component; ignore .ts files so only the .vue components are registered.
  components: [{ path: './components', ignore: ['**/*.ts'] }],
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
