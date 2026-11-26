import { copyFile, cp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from '../../src/commands/init';
import { runInspect } from '../../src/commands/inspect';
import { runModuleChange } from '../../src/commands/modules';
import { runUpgrade } from '../../src/commands/upgrade';
import { readKitModules, resolveSelection } from '../../src/kit/modules';
import { DEFAULT_TEMPLATE, openKit, resolveCommit, type KitSnapshot } from '../../src/kit/source';
import { readState } from '../../src/project/state';
import { writeTextFile } from '../../src/util/fs';
import { kitRoot } from '../kit/imports';
import { makeTempDir } from '../support/fixtureKit';

const identity = { name: 'my-project', description: 'A kit project' };
const manifestPaths = ['shared/constants/manifest.ts', 'layers/pwa/shared/constants/manifest.ts'];
let kit: KitSnapshot;
let previous: KitSnapshot;
let temp: string;
let target: string;

beforeAll(async () => {
  const source = { kind: 'local', path: kitRoot, allowDirty: true } satisfies Parameters<
    typeof openKit
  >[0];
  const commit = await resolveCommit(source);
  kit = await openKit(source, commit, DEFAULT_TEMPLATE);
  previous = await openKit(source, commit, DEFAULT_TEMPLATE);

  // Model a project created before the policy became a separate layer, even once this ships.
  await rm(join(previous.dir, 'layers/web-security'), { recursive: true, force: true });
  previous.modules = previous.modules
    .filter((module) => module.id !== 'web-security')
    .map((module) => ({
      ...module,
      requires: module.requires.filter((id) => id !== 'web-security'),
    }));
  const config = 'nuxt.config.ts';
  await writeTextFile(
    join(previous.dir, config),
    "export default defineNuxtConfig({ modules: ['nuxt-security'] });\n",
  );
  // Test the working files (openKit intentionally archives tracked commits only).
  for (const path of [
    config,
    'packages/create-nuxt-saas/kit.json',
    'layers/server-core/module.json',
    'layers/server-core/nuxt.config.ts',
    'layers/admin/nuxt.config.ts',
    'layers/auth-oauth/nuxt.config.ts',
    'layers/auth-passkeys/nuxt.config.ts',
  ]) {
    await copyFile(join(kitRoot, path), join(kit.dir, path));
  }
  const webSecurity = 'layers/web-security';
  const modules = await readKitModules(kitRoot);
  if (modules.some((module) => module.id === 'web-security')) {
    await cp(join(kitRoot, webSecurity), join(kit.dir, webSecurity), { recursive: true });
  }
  kit = { ...kit, commit: 'f'.repeat(40), modules };
}, 15000);

afterAll(async () => {
  await kit?.cleanup();
  await previous?.cleanup();
});

beforeEach(async () => {
  temp = await makeTempDir('web-security');
  target = join(temp, 'app');
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

function init(requested: string[] = [], snapshot = kit) {
  return runInit({ target, identity, requested, kit: snapshot, git: false });
}

async function installedSecurity() {
  const pkg: unknown = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  expect(pkg).toHaveProperty('dependencies.nuxt-security');
  expect(await readFile(join(target, 'layers/web-security/nuxt.config.ts'), 'utf8')).not.toBe('');
}

describe('Web Security scaffolds and upgrades', () => {
  it('installs the catalogued foundation module by default', async () => {
    await init();
    expect((await readState(target)).modules).toEqual(['web-security']);
    expect(kit.modules.find((module) => module.id === 'web-security')).toMatchObject({
      title: 'Web Security',
      group: 'Foundation',
      internal: false,
      installByDefault: true,
    });
    await installedSecurity();
  });

  it.each([['server-core'], ['auth-oauth', 'auth-passkeys'], ['admin', 'auth-password']])(
    'includes Web Security when scaffolding %j',
    async (...requested) => {
      expect(resolveSelection(kit.modules, requested)).not.toContain('web-security');
      await init(requested);
      expect((await readState(target)).modules).toEqual(expect.arrayContaining(requested));
      await installedSecurity();
    },
  );

  it('can explicitly remove security from a frontend-only scaffold', async () => {
    await init();
    await runModuleChange({
      projectRoot: target,
      kit,
      add: [],
      remove: ['web-security'],
      check: false,
      force: true,
      backup: false,
    });
    expect((await readState(target)).modules).toEqual([]);
    expect(await readFile(join(target, 'package.json'), 'utf8')).not.toContain('nuxt-security');
    expect(await readFile(join(target, 'nuxt.config.ts'), 'utf8')).not.toContain('nuxt-security');
    await expect(
      readFile(join(target, 'layers/web-security/nuxt.config.ts'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps an explicit removal on the next upgrade', async () => {
    await init();
    await runModuleChange({
      projectRoot: target,
      kit,
      add: [],
      remove: ['web-security'],
      check: false,
      force: true,
      backup: false,
    });
    const next = { ...kit, commit: 'e'.repeat(40) };
    const report = await runUpgrade({
      projectRoot: target,
      from: kit,
      to: next,
      check: false,
      force: true,
      backup: false,
    });
    expect(report.addedModules).toEqual([]);
    expect((await readState(target)).modules).toEqual([]);
  });

  it('keeps server features after removing Web Security, including through upgrades', async () => {
    await init(['admin', 'auth-oauth', 'auth-passkeys']);
    const selected = (await readState(target)).modules.filter((id) => id !== 'web-security');
    expect(selected).toEqual(
      expect.arrayContaining(['server-core', 'admin', 'auth-oauth', 'auth-passkeys']),
    );
    const report = await runModuleChange({
      projectRoot: target,
      kit,
      add: [],
      remove: ['web-security'],
      check: false,
      force: true,
      backup: false,
    });
    expect(report.removedModules).toEqual(['web-security']);
    expect((await readState(target)).modules).toEqual(selected);
    const pkg: unknown = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
    expect(pkg).not.toHaveProperty('dependencies.nuxt-security');

    const next = { ...kit, commit: 'e'.repeat(40) };
    const upgrade = await runUpgrade({
      projectRoot: target,
      from: kit,
      to: next,
      check: false,
      force: true,
      backup: false,
    });
    expect(upgrade.addedModules).toEqual([]);
    expect((await readState(target)).modules).toEqual(selected);
  });

  it('does not reinstall security when adding a server feature after opting out', async () => {
    await init();
    await runModuleChange({
      projectRoot: target,
      kit,
      add: [],
      remove: ['web-security'],
      check: false,
      force: true,
      backup: false,
    });
    await runModuleChange({
      projectRoot: target,
      kit,
      add: ['database'],
      remove: [],
      check: false,
      force: true,
      backup: false,
    });
    expect((await readState(target)).modules).toEqual(['database', 'server-core']);
  });

  it('keeps installed security when upgrading from a kit that required it for Server Core', async () => {
    const required = {
      ...kit,
      commit: 'd'.repeat(40),
      modules: kit.modules.map((module) =>
        module.id === 'server-core' ? { ...module, requires: ['web-security'] } : module,
      ),
    };
    await init(['database'], required);
    const report = await runUpgrade({
      projectRoot: target,
      from: required,
      to: kit,
      check: false,
      force: true,
      backup: false,
    });
    expect(report.removedModules).toEqual([]);
    expect((await readState(target)).modules).toEqual(['database', 'server-core', 'web-security']);
    await installedSecurity();
  });

  it('migrates protection from the old base into the first Web Security release', async () => {
    await init([], previous);
    expect((await readState(target)).modules).toEqual([]);
    const report = await runUpgrade({
      projectRoot: target,
      from: previous,
      to: kit,
      check: false,
      force: true,
      backup: false,
    });
    expect(report).toMatchObject({ addedModules: ['web-security'], conflicts: [], applied: true });
    await installedSecurity();
  });
});

it('reports branding edits as expected but keeps framework config in the inspect score', async () => {
  await init(['pwa']);
  for (const path of [...manifestPaths, 'nuxt.config.ts']) {
    await writeTextFile(join(target, path), '// Customized by the project\n');
  }
  const { files, summary } = await runInspect({ projectRoot: target, kit });
  expect(files).toEqual(
    expect.arrayContaining([
      ...manifestPaths.map((path) =>
        expect.objectContaining({ path, status: 'edited', expected: true }),
      ),
      expect.objectContaining({ path: 'nuxt.config.ts', status: 'edited', expected: false }),
    ]),
  );
  expect(summary.scoredChanged).toBe(1);
});
