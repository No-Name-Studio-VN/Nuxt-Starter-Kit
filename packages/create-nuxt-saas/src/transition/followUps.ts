import type { Tree } from '../render/render';
import type { FileChange } from './plan';

const schemaPath = /(?:^|\/)server\/db\/(?:schema(?:\.sqlite)?\.ts|schema\/[^/]+\.ts)$/;

function envKeys(tree: Tree | null): string[] {
  const raw = tree?.get('.env.example')?.content.toString('utf8') ?? '';
  return [...new Set([...raw.matchAll(/^\s*([A-Z_]\w*)=/gim)].flatMap((match) => match[1] ?? []))];
}

export function followUpsFor(
  base: Tree | null,
  target: Tree,
  changes: FileChange[],
  selected: string[],
): string[] {
  const followUps: string[] = [];
  const changed = changes.filter(
    (change) => change.kind !== 'keep-edited' && change.kind !== 'keep-protected',
  );
  if (base === null || changed.some((change) => change.path === 'package.json')) {
    followUps.push('pnpm install');
  }
  const schemasChanged =
    base === null
      ? selected.includes('database') || [...target.keys()].some((path) => schemaPath.test(path))
      : changed.some((change) => schemaPath.test(change.path));
  if (schemasChanged) followUps.push('pnpm db:generate');
  const existing = new Set(envKeys(base));
  const added = envKeys(target).filter((key) => !existing.has(key));
  if (base === null && added.length > 0) {
    followUps.push(`cp .env.example .env and fill: ${added.join(', ')}`);
  } else {
    followUps.push(...added.map((key) => `Add ${key} to .env`));
  }
  return followUps;
}
