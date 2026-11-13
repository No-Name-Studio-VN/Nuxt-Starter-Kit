import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '#layers': fileURLToPath(new URL('../../layers', import.meta.url)) } },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
