import { z } from 'zod';
import { CliError } from '../errors';

export const MANIFEST_SCHEMA_VERSION = 1;
/** Bumped only when rendering semantics change; upgrades warn on a mismatch. */
export const RENDER_VERSION = 1;

const manifestModuleSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  files: z.record(z.string(), z.string()),
  orphaned: z.array(z.string()).default([]),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  renderVersion: z.number().int().positive(),
  kit: z.object({ template: z.string().min(1), revision: z.string().min(1) }),
  placeholders: z.record(z.string(), z.string()),
  modules: z.array(manifestModuleSchema),
});

export type ManifestModule = z.infer<typeof manifestModuleSchema>;
export type ProjectManifest = z.infer<typeof manifestSchema>;

export function parseManifest(value: unknown, sourceLabel: string): ProjectManifest {
  const result = manifestSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join('.') : '(root)';
    throw new CliError(
      `Invalid project manifest at ${sourceLabel}: ${path} ${issue?.message ?? 'is invalid'}`,
    );
  }
  return result.data;
}
