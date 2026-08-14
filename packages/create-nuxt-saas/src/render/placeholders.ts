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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function substituteValue(value: unknown, placeholders: Placeholders): unknown {
  if (typeof value === 'string') return applyPlaceholders(value, placeholders);
  if (Array.isArray(value)) return value.map((item) => substituteValue(item, placeholders));
  if (isRecord(value)) return substituteFragment(value, placeholders);
  return value;
}

/**
 * The same substitution over a structured fragment's string values.
 *
 * A file assembled key-by-key never passes through `applyPlaceholders`, so
 * without this the kit's own package name and description would follow every
 * generated project — the kit cannot hold `{{PROJECT_NAME}}` in that field and
 * still install.
 */
export function substituteFragment(
  fragment: Record<string, unknown>,
  placeholders: Placeholders,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fragment).map(([key, value]) => [key, substituteValue(value, placeholders)]),
  );
}
