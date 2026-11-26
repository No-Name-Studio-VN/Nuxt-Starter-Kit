import { readFile } from 'node:fs/promises';
import { glob } from 'tinyglobby';
import { CliError } from '../errors';
import { readKitConfig } from '../kit/config';
import type { KitSnapshot } from '../kit/source';
import { readRegularFile } from '../util/fs';
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
  const tree: Tree = new Map();
  for await (const [path, file] of renderFiles(kit, selected, identity)) {
    if (file !== 'tooLarge') tree.set(path, file);
  }
  return new Map([...tree].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
}

/** The same render for inspection and comparison; a preview can skip paths and cap each input. */
export async function* renderFiles(
  kit: KitSnapshot,
  selected: string[],
  identity: ProjectIdentity,
  preview?: { include: (path: string) => boolean; maxBytes: number },
): AsyncGenerator<[string, TreeFile | 'tooLarge']> {
  async function read(path: string): Promise<Buffer | 'tooLarge'> {
    const absolute = resolveInside(kit.dir, path, 'Kit file');
    if (!preview) return readFile(absolute);
    const result = await readRegularFile(kit.dir, absolute, preview.maxBytes);
    if (result === null || result === 'owned')
      throw new CliError(`Cannot read rendered kit file ${path}.`);
    return result;
  }
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
  for (const path of paths.map(toPosixPath).sort()) {
    if (preview && !preview.include(path)) continue;
    let content = await read(path);
    if (content === 'tooLarge') {
      yield [path, content];
      continue;
    }
    if (path === 'package.json') {
      content = Buffer.from(composePackageJson(content.toString('utf8'), drop, identity));
    } else if (path === '.env.example') {
      content = Buffer.from(composeEnvExample(content.toString('utf8'), dropEnv));
    } else if (path === 'wrangler.jsonc') {
      content = Buffer.from(composeWrangler(content.toString('utf8'), dropBindings, identity));
    }
    yield [path, { content, binary: content.includes(0) }];
  }
  if (preview && !preview.include('README.md')) return;
  const modules =
    kit.modules
      .filter((module) => selectedIds.has(module.id) && !module.internal)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((module) => `- **${module.title}** — ${module.description}`)
      .join('\n') || '- None (base only)';
  const values: Record<string, string> = { ...identity, modules };
  const template = await read('packages/create-nuxt-saas/templates/README.md');
  if (template === 'tooLarge') {
    yield ['README.md', template];
    return;
  }
  const content = Buffer.from(
    template
      .toString('utf8')
      .replace(/\{\{(name|description|modules)\}\}/g, (match, key: string) => values[key] ?? match),
  );
  yield ['README.md', { content, binary: content.includes(0) }];
}
