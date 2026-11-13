import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_TEMPLATE, openKit, resolveCommit, type KitSnapshot } from '../../src/kit/source';
import { render, type Tree } from '../../src/render/render';
import { createFixtureKit } from '../support/fixtureKit';

const identity = { name: 'my-app', description: 'My project' };
const packageSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  scripts: z.record(z.string(), z.string()).default({}),
});

function text(tree: Tree, path: string): string {
  const file = tree.get(path);
  if (!file) throw new Error(`Missing rendered file: ${path}`);
  return file.content.toString('utf8');
}

function packageJson(tree: Tree) {
  const value: unknown = JSON.parse(text(tree, 'package.json'));
  return packageSchema.parse(value);
}

function envKeys(tree: Tree): string[] {
  return [...text(tree, '.env.example').matchAll(/^([A-Z_][A-Z_0-9]*)=/gm)].flatMap(
    (match) => match[1] ?? [],
  );
}

function bindings(tree: Tree): string[] {
  return [...text(tree, 'wrangler.jsonc').matchAll(/"binding"\s*:\s*"([^"]+)"/g)].flatMap(
    (match) => match[1] ?? [],
  );
}

function markerLeaks(tree: Tree): string[] {
  return [...tree].filter(([, file]) => file.content.includes('nsk')).map(([path]) => path);
}

describe('render fixture v1', () => {
  let fixture: Awaited<ReturnType<typeof createFixtureKit>>;
  let kit: KitSnapshot;

  beforeAll(async () => {
    fixture = await createFixtureKit();
    kit = await openKit(
      { kind: 'local', path: fixture.root, allowDirty: false },
      fixture.v1,
      DEFAULT_TEMPLATE,
    );
    await writeFile(join(kit.dir, '.DS_Store'), 'junk');
    await mkdir(join(kit.dir, 'app/.hidden'), { recursive: true });
    await writeFile(join(kit.dir, 'app/.hidden/.DS_Store'), 'junk');
    await writeFile(join(kit.dir, '.editorconfig'), 'root = true\n');
  });

  afterAll(async () => {
    await kit?.cleanup();
    if (fixture) await rm(fixture.root, { recursive: true, force: true });
  });

  it('renders only base files, composes root configuration and detects binary content', async () => {
    const tree = await render(kit, [], identity);
    expect([...tree.keys()].some((path) => path.startsWith('layers/'))).toBe(false);
    expect(tree.has('content/hello.md')).toBe(false);
    expect(tree.has('docs/x.md')).toBe(false);
    expect([...tree.keys()].some((path) => path.startsWith('packages/'))).toBe(false);
    expect([...tree.keys()].some((path) => path.endsWith('.DS_Store'))).toBe(false);
    expect(text(tree, '.editorconfig')).toBe('root = true\n');
    const pkg = packageJson(tree);
    expect(Object.keys(pkg.dependencies)).toEqual(['base-dep']);
    expect(Object.keys(pkg.scripts)).toEqual(['dev']);
    expect(pkg).toMatchObject({ name: 'my-app', description: 'My project', version: '0.1.0' });
    expect(text(tree, '.env.example')).toBe('SITE_URL=\n');
    const worker: unknown = parse(text(tree, 'wrangler.jsonc'));
    expect(worker).toMatchObject({ name: 'my-app', d1_databases: [], kv_namespaces: [] });
    expect(worker).not.toHaveProperty('routes');
    expect(text(tree, 'README.md')).toContain('# my-app');
    expect(text(tree, 'README.md')).toContain('My project');
    expect(text(tree, 'README.md')).toContain('- None (base only)');
    expect(tree.get('public/logo.png')).toEqual({
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0x0d, 0x0a]),
      binary: true,
    });
    expect(tree.get('app/pages/index.vue')?.binary).toBe(false);
    expect(markerLeaks(tree)).toEqual([]);
  });

  it('keeps selected layers, root files, dependencies, env and bindings', async () => {
    const tree = await render(kit, ['alpha', 'beta', 'docs'], identity);
    expect(text(tree, 'layers/alpha/app/pages/alpha.vue')).toContain('Alpha v1');
    expect(text(tree, 'content/hello.md')).toBe('# Hello\n');
    expect(tree.has('layers/beta/module.json')).toBe(true);
    expect(Object.keys(packageJson(tree).dependencies)).toEqual([
      'base-dep',
      'alpha-dep',
      'beta-dep',
    ]);
    expect(envKeys(tree)).toEqual(['SITE_URL', 'ALPHA_KEY']);
    expect(bindings(tree)).toEqual(['DB', 'KV']);
    expect(text(tree, 'README.md')).toContain(
      '- **Alpha** — Alpha features\n- **Beta** — Beta features\n- **Docs** — Documentation content',
    );
    expect(markerLeaks(tree)).toEqual([]);
  });

  it('drops only unselected modules and hides internal modules from the README', async () => {
    const internalKit = {
      ...kit,
      modules: kit.modules.map((module) => ({ ...module, internal: module.id === 'alpha' })),
    };
    const tree = await render(internalKit, ['alpha'], identity);
    expect(tree.has('layers/alpha/module.json')).toBe(true);
    expect(tree.has('layers/beta/module.json')).toBe(false);
    expect(tree.has('layers/docs/module.json')).toBe(false);
    expect(tree.has('content/hello.md')).toBe(false);
    expect(Object.keys(packageJson(tree).dependencies)).toEqual(['base-dep', 'alpha-dep']);
    expect(bindings(tree)).toEqual(['DB']);
    expect(text(tree, 'README.md')).toContain('- None (base only)');
    expect(text(tree, 'README.md')).not.toContain('**Alpha**');
  });

  it('produces byte-identical trees with sorted POSIX paths, independent of selection order', async () => {
    const first = await render(kit, ['alpha', 'beta', 'docs'], identity);
    const second = await render(kit, ['docs', 'beta', 'alpha'], identity);
    expect([...first]).toEqual([...second]);
    expect([...first.keys()]).toEqual([...first.keys()].sort());
    expect([...first.keys()].some((path) => path.includes('\\'))).toBe(false);
  });

  it('substitutes template values literally without interpreting replacement tokens or nested placeholders', async () => {
    const tree = await render(kit, [], { name: 'my-app', description: '$& {{modules}} {{name}}' });
    expect(text(tree, 'README.md')).toBe(
      '# my-app\n\n$& {{modules}} {{name}}\n\nModules: - None (base only)\n',
    );
  });
});

describe('render real kit', () => {
  it('renders base and all modules without excluded files, claims or markers leaking', async () => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    const source = { kind: 'local', path: root, allowDirty: true } satisfies Parameters<
      typeof openKit
    >[0];
    const kit = await openKit(source, await resolveCommit(source), DEFAULT_TEMPLATE);
    try {
      // The two new kit inputs are not in HEAD until this task is committed.
      for (const path of ['kit.json', 'templates/README.md']) {
        await mkdir(join(kit.dir, 'packages/create-nuxt-saas', path, '..'), { recursive: true });
        await copyFile(
          join(root, 'packages/create-nuxt-saas', path),
          join(kit.dir, 'packages/create-nuxt-saas', path),
        );
      }
      const excludedInput: unknown = JSON.parse(
        await readFile(join(root, 'packages/create-nuxt-saas/kit.json'), 'utf8'),
      );
      const config = z.object({ exclude: z.array(z.string()) }).parse(excludedInput);
      const leaks: string[] = [];
      for (const selected of [[], kit.modules.map((module) => module.id)]) {
        const tree = await render(kit, selected, identity);
        const label = selected.length === 0 ? 'base-only' : 'all-modules';
        const pkg = packageJson(tree);
        const env = envKeys(tree);
        const keptBindings = bindings(tree);
        const dropped = kit.modules.filter((module) => !selected.includes(module.id));
        for (const module of dropped) {
          for (const name of [...module.dependencies, ...module.devDependencies]) {
            // A module-owned package must not survive in either dependency section.
            if (name in pkg.dependencies || name in pkg.devDependencies)
              leaks.push(`${label}: ${module.id} dependency ${name}`);
          }
          for (const name of module.scripts)
            if (name in pkg.scripts) leaks.push(`${label}: script ${name}`);
          for (const key of module.env) if (env.includes(key)) leaks.push(`${label}: env ${key}`);
          for (const binding of module.bindings)
            if (keptBindings.includes(binding)) leaks.push(`${label}: binding ${binding}`);
          if ([...tree.keys()].some((path) => path.startsWith(`layers/${module.id}/`)))
            leaks.push(`${label}: layer ${module.id}`);
        }
        for (const path of markerLeaks(tree)) leaks.push(`${label}: nsk in ${path}`);
        expect(tree.has('app/app.vue')).toBe(true);
        expect(tree.has('layers/auth/module.json')).toBe(selected.length > 0);
        expect(tree.has('content/blogs/sample.md')).toBe(selected.length > 0);
        expect([...tree.keys()].some((path) => /^(?:packages|docs|tests)\//.test(path))).toBe(
          false,
        );
        expect(tree.has('vitest.config.ts')).toBe(true);
        expect(tree.has('.nuxtrc')).toBe(true);
        expect(tree.has('test/unit/setup/h3Globals.ts')).toBe(true);
        expect(tree.has('test/unit/mocks/hubDb.ts')).toBe(true);
        expect([...tree.keys()].some((path) => path.startsWith('test/unit/security/'))).toBe(false);
        expect(pkg.scripts).not.toHaveProperty('typecheck:test');
        const worker: unknown = parse(text(tree, 'wrangler.jsonc'));
        expect(worker).toMatchObject({ name: 'my-app' });
        expect(worker).not.toHaveProperty('routes');
        console.info(
          JSON.stringify({
            label,
            files: tree.size,
            dependencies: Object.keys(pkg.dependencies),
            devDependencies: Object.keys(pkg.devDependencies),
            env,
            bindings: keptBindings,
            exclude: config.exclude,
          }),
        );
      }
      expect(leaks, leaks.join('\n')).toEqual([]);
    } finally {
      await kit.cleanup();
    }
  });
});
