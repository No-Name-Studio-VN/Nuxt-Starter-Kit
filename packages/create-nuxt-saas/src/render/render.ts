import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { glob } from 'tinyglobby';
import { z } from 'zod';
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

const kitConfigSchema = z.object({ exclude: z.array(z.string()) });

export async function render(
  kit: KitSnapshot,
  selected: string[],
  identity: ProjectIdentity,
): Promise<Tree> {
  const cliRoot = join(kit.dir, 'packages/create-nuxt-saas');
  const parsed: unknown = JSON.parse(await readFile(join(cliRoot, 'kit.json'), 'utf8'));
  const config = kitConfigSchema.parse(parsed);
  const selectedIds = new Set(selected);
  const dropped = kit.modules.filter((module) => !selectedIds.has(module.id));
  const drop: Claims = {
    dependencies: new Set(dropped.flatMap((module) => module.dependencies)),
    devDependencies: new Set(dropped.flatMap((module) => module.devDependencies)),
    scripts: new Set(dropped.flatMap((module) => module.scripts)),
  };
  const dropEnv = new Set(dropped.flatMap((module) => module.env));
  const dropBindings = new Set(dropped.flatMap((module) => module.bindings));
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
