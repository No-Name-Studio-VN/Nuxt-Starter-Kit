import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/** Files every project is expected to edit; used for kits whose kit.json predates `userOwned`. */
export const DEFAULT_USER_OWNED = [
  'package.json',
  'wrangler.jsonc',
  '.env.example',
  'README.md',
  'site.config.ts',
  'i18n/**',
  'public/**',
];

export interface KitConfig {
  groups?: string[] | undefined;
  exclude: string[];
  userOwned: string[];
}

const kitConfigSchema = z.object({
  groups: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string()),
  userOwned: z.array(z.string()).default(DEFAULT_USER_OWNED),
});

export async function readKitConfig(kitDir: string): Promise<KitConfig> {
  const parsed: unknown = JSON.parse(
    await readFile(join(kitDir, 'packages/create-nuxt-saas/kit.json'), 'utf8'),
  );
  return kitConfigSchema.parse(parsed);
}
