const lockfiles = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb']);

export function isProtected(path: string): boolean {
  return (
    path === '.env' ||
    (path.startsWith('.env.') && path !== '.env.example') ||
    path.startsWith('server/db/migrations/') ||
    lockfiles.has(path) ||
    path.startsWith('content/') ||
    path === '.nuxt-saas.json'
  );
}
