import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNuxt } from '@nuxt/kit';
import { createJiti } from 'jiti';
import { expect, it } from 'vitest';
import { z } from 'zod';
import type * as ContentConfig from '../../../layers/content/content.config';

it('declares native navigation booleans alongside kit link metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kit-content-schema-'));
  try {
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'junction');
    await writeFile(join(root, 'nuxt.config.ts'), 'export default { modules: ["@nuxt/content"] };');
    const nuxt = await loadNuxt({ cwd: root, overrides: { devtools: false, telemetry: false } });
    try {
      const { default: config } = await createJiti(import.meta.url).import<typeof ContentConfig>(
        '../../../layers/content/content.config.ts',
      );
      const collection = config.collections.content;
      const definition = Object.values(collection?.extendedSchema.definitions ?? {})[0];
      const navigation = definition?.properties.navigation;
      if (!navigation) throw new Error('The Content page collection has no navigation field.');
      const schema = z.fromJSONSchema(navigation);
      for (const value of [false, true, { redirect: '/docs', target: '_blank' }]) {
        expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(true);
      }
    } finally {
      await nuxt.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
