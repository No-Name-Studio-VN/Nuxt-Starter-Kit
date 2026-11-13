import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { readKitModules } from '../../src/kit/modules';
import { createFixtureKit } from './fixtureKit';

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('two-commit fixture kit', () => {
  it('creates deterministic commits in isolated repositories without needing a git identity', async () => {
    const first = await createFixtureKit();
    roots.push(first.root);
    const second = await createFixtureKit();
    roots.push(second.root);
    expect(first.root).not.toBe(second.root);
    expect(first.v1).toMatch(/^[a-f0-9]{40}$/);
    expect(first.v2).not.toBe(first.v1);
    expect(second.v1).toBe(first.v1);
    expect(second.v2).toBe(first.v2);
    expect((await run('git', ['-C', first.root, 'status', '--porcelain'])).stdout).toBe('');
    expect((await run('git', ['-C', first.root, 'rev-parse', `${first.v2}^`])).stdout.trim()).toBe(
      first.v1,
    );
  });

  it('models every upgrade change and alpha’s added env claim', async () => {
    const kit = await createFixtureKit();
    roots.push(kit.root);
    const { stdout } = await run('git', ['-C', kit.root, 'diff', '--name-status', kit.v1, kit.v2]);
    expect(stdout.trim().split('\n').sort()).toEqual(
      [
        'M\t.env.example',
        'D\tREADME.md',
        'D\tobsolete.txt',
        'M\tapp/pages/index.vue',
        'A\tapp/pages/new.vue',
        'M\tlayers/alpha/app/pages/alpha.vue',
        'M\tlayers/alpha/module.json',
        'M\tlayers/beta/server/db/schema.sqlite.ts',
        'M\tpackage.json',
        'M\twrangler.jsonc',
      ].sort(),
    );
    const modules = await readKitModules(kit.root);
    expect(modules.find((module) => module.id === 'alpha')?.env).toEqual([
      'ALPHA_KEY',
      'ALPHA_SECOND',
    ]);
    expect(modules.find((module) => module.id === 'beta')?.requires).toEqual(['alpha']);
    expect(modules.find((module) => module.id === 'docs')?.rootFiles).toEqual(['content/**']);
  });
});
