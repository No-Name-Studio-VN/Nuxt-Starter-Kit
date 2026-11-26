import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { glob } from 'tinyglobby';
import { readKitConfig } from '../kit/config';
import type { KitSnapshot } from '../kit/source';
import { resolveInside, toPosixPath } from '../util/paths';
import { composeEnvExample, composePackageJson, composeWrangler, type Claims } from './compose';

export interface TreeFile {
  content: Buffer;
  binary: boolean;
}

export type Tree = Map<string, TreeFile>;

export interface ProjectIdentity {
  name: string;
  description: string;
}

export async function render(
  kit: KitSnapshot,
  selected: string[],
  identity: ProjectIdentity,
): Promise<Tree> {
  const cliRoot = join(kit.dir, 'packages/create-nuxt-saas');
  const config = await readKitConfig(kit.dir);
  const selectedIds = new Set(selected);
  const dropped = kit.modules.filter((module) => !selectedIds.has(module.id));
  const kept = kit.modules.filter((module) => selectedIds.has(module.id));
  function unselectedClaims(section: keyof Claims | 'env' | 'bindings'): Set<string> {
    const retained = new Set(kept.flatMap((module) => module[section]));
    return new Set(
      dropped.flatMap((module) => module[section]).filter((name) => !retained.has(name)),
    );
  }
  const drop: Claims = {
    dependencies: unselectedClaims('dependencies'),
    devDependencies: unselectedClaims('devDependencies'),
    scripts: new Set([...config.excludeScripts, ...unselectedClaims('scripts')]),
  };
  const dropEnv = unselectedClaims('env');
  const dropBindings = unselectedClaims('bindings');
  const paths = await glob('**/*', {
    cwd: kit.dir,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: [
      ...config.exclude,
      '**/.DS_Store',
      'README.md',
      ...dropped.flatMap((module) => [`layers/${module.id}/**`, ...module.rootFiles]),
    ],
  });
  const tree: Tree = new Map();
  for (const path of paths.map(toPosixPath).sort()) {
    let content = await readFile(resolveInside(kit.dir, path, 'Kit file'));
    if (path === 'package.json') {
      content = Buffer.from(composePackageJson(content.toString('utf8'), drop, identity));
    } else if (path === '.env.example') {
      content = Buffer.from(composeEnvExample(content.toString('utf8'), dropEnv));
    } else if (path === 'wrangler.jsonc') {
      content = Buffer.from(composeWrangler(content.toString('utf8'), dropBindings, identity));
    }
    tree.set(path, { content, binary: content.includes(0) });
  }
  const modules =
    kit.modules
      .filter((module) => selectedIds.has(module.id) && !module.internal)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((module) => `- **${module.title}** — ${module.description}`)
      .join('\n') || '- None (base only)';
  const values: Record<string, string> = { ...identity, modules };
  const template = await readFile(join(cliRoot, 'templates/README.md'), 'utf8');
  const content = Buffer.from(
    template.replace(
      /\{\{(name|description|modules)\}\}/g,
      (match, key: string) => values[key] ?? match,
    ),
  );
  tree.set('README.md', { content, binary: content.includes(0) });
  return new Map([...tree].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
}
