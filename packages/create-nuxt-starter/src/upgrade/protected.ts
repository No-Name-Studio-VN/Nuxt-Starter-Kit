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

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(path));
}
