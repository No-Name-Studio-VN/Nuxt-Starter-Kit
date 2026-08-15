import { CliError } from '../errors';

export const DEFAULT_PROJECT_NAME = 'my-nuxt-app';

/** npm rejects anything longer, and the name reaches package.json verbatim. */
const MAX_LENGTH = 214;

/** The unscoped npm name charset, which is also safe as a single path segment. */
const ALLOWED = /^[a-z0-9._~-]+$/;

/**
 * Names npm refuses outright because they collide with something it manages.
 */
const BLOCKLIST = new Set(['node_modules', 'favicon.ico']);

/**
 * Windows resolves these to devices no matter the extension, so a directory of
 * this name cannot be created there. Cheap to refuse everywhere rather than
 * generate a project that only fails on one platform.
 */
const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/**
 * Why `name` cannot be used, or null when it can.
 *
 * The name is both the package.json `name` and a directory the CLI creates, so
 * it has to satisfy npm and the filesystem at once. Returning the message rather
 * than throwing is what lets clack re-prompt in place: the user fixes the name
 * without losing the run.
 */
export function validateProjectName(name: string): string | null {
  if (name.trim().length === 0) return 'Enter a project name.';
  if (name.length > MAX_LENGTH) return `Use ${MAX_LENGTH} characters or fewer.`;
  if (name !== name.toLowerCase()) return 'Use lowercase letters — npm rejects capitals.';
  if (/[/\\]/.test(name)) return 'Use a single folder name, without slashes.';
  if (name === '.' || name === '..') return 'Enter a name, not a directory reference.';
  if (name.startsWith('.') || name.startsWith('_')) return 'Do not start with a dot or underscore.';
  if (!ALLOWED.test(name)) return 'Use letters, digits, hyphens, dots and underscores only.';
  // Windows silently strips both, so the folder would not match the name.
  if (name.endsWith('.') || name.endsWith(' ')) return 'Do not end with a dot or a space.';
  if (BLOCKLIST.has(name)) return `"${name}" is reserved by npm.`;
  if (WINDOWS_RESERVED.has(name)) return `"${name}" is a reserved device name on Windows.`;
  return null;
}

export function assertProjectName(name: string): void {
  const problem = validateProjectName(name);
  if (problem !== null) throw new CliError(`Invalid project name "${name}": ${problem}`);
}

/**
 * Coerces arbitrary text into a usable project name.
 *
 * Applied to names the user did not type — the ones derived from a directory
 * argument, where `nuxt-saas init ./MyApp` should not be a dead end just because
 * the folder is capitalised. Typed names go through {@link validateProjectName}
 * instead, which can afford to be strict because the prompt re-asks immediately.
 *
 * The result always satisfies {@link validateProjectName}.
 */
export function sanitizeProjectName(value: string): string {
  const collapsed = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[-._~]+/, '')
    .replace(/[-._~ ]+$/, '')
    .slice(0, MAX_LENGTH)
    // Truncation can re-expose a trailing separator.
    .replace(/[-._~]+$/, '');

  if (collapsed.length === 0) return DEFAULT_PROJECT_NAME;
  if (BLOCKLIST.has(collapsed) || WINDOWS_RESERVED.has(collapsed)) return `${collapsed}-app`;
  return collapsed;
}
