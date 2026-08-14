import { fileURLToPath } from 'node:url';
import { defineVitestProject } from '@nuxt/test-utils/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.{test,spec}.ts'],
          setupFiles: ['./test/unit/setup/h3Globals.ts'],
        },
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./app', import.meta.url)),
            '~': fileURLToPath(new URL('./app', import.meta.url)),
            '~~': fileURLToPath(new URL('.', import.meta.url)),
            '@@': fileURLToPath(new URL('.', import.meta.url)),
            '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
            'hub:blob': fileURLToPath(new URL('./test/unit/mocks/hubBlob.ts', import.meta.url)),
            'hub:db': fileURLToPath(new URL('./test/unit/mocks/hubDb.ts', import.meta.url)),
          },
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.{test,spec}.ts'],
          environment: 'nuxt',
          fileParallelism: true,
          environmentOptions: {
            nuxt: {
              domEnvironment: 'happy-dom',
              mock: { indexedDb: true },
            },
          },
        },
      }),
    ],
  },
});
