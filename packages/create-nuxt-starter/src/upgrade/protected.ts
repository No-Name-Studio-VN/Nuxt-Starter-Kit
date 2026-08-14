/**
 * Paths an upgrade never writes: user secrets, user-authored content, generated
 * migrations, lockfiles, and the CLI's own metadata (rewritten wholesale, never
 * merged). `content.config.ts` is deliberately not protected — it is kit code,
 * unlike the documents under `content/`.
 */
const PROTECTED_PATTERNS: RegExp[] = [
  /^\.env(\.|$)/,
  /^content\//,
  /^server\/db\/migrations\//,
  /^\.nuxt-starter\//,
  /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$/,
];

/**
 * Env templates, which the `.env` rule would otherwise catch by name.
 *
 * They hold no secrets — they are the kit's list of what a project has to set —
 * so protecting them would mean a module could never tell an existing project
 * about a variable it started needing.
 */
const ENV_TEMPLATE = /^\.env\.(example|sample|template)$/;

export function isProtectedPath(path: string): boolean {
  if (ENV_TEMPLATE.test(path)) return false;
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(path));
}
