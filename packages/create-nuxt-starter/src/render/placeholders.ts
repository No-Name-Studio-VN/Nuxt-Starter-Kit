import { CliError } from '../errors';

export const PLACEHOLDER_KEYS = [
  'PROJECT_NAME',
  'PROJECT_DESCRIPTION',
  'AUTHOR_NAME',
  'AUTHOR_EMAIL',
] as const;

export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number];
export type Placeholders = Record<string, string>;

export function assertKnownPlaceholders(placeholders: Placeholders): void {
  const known = new Set<string>(PLACEHOLDER_KEYS);
  for (const key of Object.keys(placeholders)) {
    if (!known.has(key)) {
      throw new CliError(
        `Unknown placeholder "${key}". Known placeholders: ${PLACEHOLDER_KEYS.join(', ')}.`,
      );
    }
  }
}

/**
 * Replaces `{{TOKEN}}` with its value in a single pass, so substituted values are
 * never themselves expanded. Rendering must stay reproducible: an old revision
 * rendered today has to match byte-for-byte what an older CLI produced, or
 * three-way upgrades would diff against the wrong base.
 */
export function applyPlaceholders(contents: string, placeholders: Placeholders): string {
  return contents.replaceAll(/\{\{([A-Z0-9_]+)\}\}/g, (token: string, key: string) => {
    const value = placeholders[key];
    return value === undefined ? token : value;
  });
}
