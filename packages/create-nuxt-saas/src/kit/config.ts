import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CliError } from '../errors';
import { changeNotesSchema, type KitChangeNote } from './notes';

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
  changes: KitChangeNote[];
}

const kitConfigSchema = z.object({
  groups: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string()),
  userOwned: z.array(z.string()).default(DEFAULT_USER_OWNED),
  changes: changeNotesSchema,
});

export const KIT_CONFIG_PATH = 'packages/create-nuxt-saas/kit.json';

export async function readKitConfig(kitDir: string): Promise<KitConfig> {
  const path = join(kitDir, KIT_CONFIG_PATH);
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return kitConfigSchema.parse(parsed);
  } catch (error) {
    throw new CliError(`Invalid kit config at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
