import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileAction } from '../../src/upgrade/plan';
import { planUpgrade } from '../../src/upgrade/plan';
import { loadFixtureRegistryV2 } from '../support/fixtureKit';
import {
  commitAll,
  editFile,
  generateProjectAtV1,
  resolveFixtureKit,
} from '../support/upgradeFixture';

async function plan(projectRoot: string) {
  const registry = await loadFixtureRegistryV2();
  return planUpgrade({
    projectRoot,
    registry,
    targetRevision: registry.kit.revision,
    resolveLocalKit: resolveFixtureKit,
  });
}

function actionFor(actions: FileAction[], path: string): FileAction {
  const action = actions.find((candidate) => candidate.path === path);
  if (!action) throw new Error(`no action planned for ${path}`);
  return action;
}

describe('planUpgrade', () => {
  it('reports the revision move and module version bumps', async () => {
    const result = await plan(await generateProjectAtV1(['content']));
    expect(result.fromRevision).toBe('v1');
    expect(result.toRevision).toBe('v2');
    expect(result.moduleUpdates).toContainEqual({ id: 'content', from: '1.0.0', to: '2.0.0' });
    await result.cleanup();
  });

  it('skips files that did not change upstream', async () => {
    const result = await plan(await generateProjectAtV1(['pwa']));
    expect(actionFor(result.actions, 'app/app.vue').type).toBe('skip');
    await result.cleanup();
  });

  it('overwrites files the user never edited', async () => {
    const result = await plan(await generateProjectAtV1(['base']));
    const action = actionFor(result.actions, 'app/pages/index.vue');
    expect(action.type).toBe('overwrite');
    if (action.type !== 'overwrite') return;
    expect(action.content).toContain('Welcome home');
    await result.cleanup();
  });

  it('merges non-overlapping user edits', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await editFile(
      projectRoot,
      'nuxt.config.ts',
      // Edited well away from the upstream change: upstream inserts at the top
      // and inside the content block, the user appends at the bottom.
      [
        'export default defineNuxtConfig({',
        '  modules: [',
        '    // <nsk:content>',
        "    '@nuxt/content',",
        '    // </nsk:content>',
        '  ],',
        '  ssr: false,',
        '});',
        '',
      ].join('\n'),
    );
    await commitAll(projectRoot);

    const result = await plan(projectRoot);
    const action = actionFor(result.actions, 'nuxt.config.ts');
    expect(action.type).toBe('merge');
    if (action.type !== 'merge') return;
    expect(action.content).toContain('ssr: false');
    expect(action.content).toContain('@nuxtjs/mdc');
    expect(action.content).toContain('compatibilityDate');
    await result.cleanup();
  });

  it('reports overlapping edits as conflicts', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(
      projectRoot,
      'app/pages/index.vue',
      '<template>\n  <h1>My page</h1>\n</template>\n',
    );
    await commitAll(projectRoot);

    const result = await plan(projectRoot);
    const action = actionFor(result.actions, 'app/pages/index.vue');
    expect(action.type).toBe('conflict');
    if (action.type !== 'conflict') return;
    expect(action.content).toContain('<<<<<<<');
    expect(action.content).toContain('My page');
    expect(action.content).toContain('Welcome home');
    await result.cleanup();
  });

  it('adds new upstream files', async () => {
    const result = await plan(await generateProjectAtV1(['base']));
    expect(actionFor(result.actions, 'app/pages/about.vue').type).toBe('add');
    await result.cleanup();
  });

  it('deletes upstream-removed files the user never edited', async () => {
    const result = await plan(await generateProjectAtV1(['base']));
    expect(actionFor(result.actions, 'app/legacy.ts').type).toBe('delete');
    await result.cleanup();
  });

  it('keeps upstream-removed files the user edited, as orphans', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/legacy.ts', "export const legacyHelper = 'mine';\n");
    await commitAll(projectRoot);

    const result = await plan(projectRoot);
    expect(actionFor(result.actions, 'app/legacy.ts').type).toBe('orphan');
    await result.cleanup();
  });

  it('never plans anything for protected paths', async () => {
    const result = await plan(await generateProjectAtV1(['content']));
    expect(result.actions.every((action) => !action.path.startsWith('.nuxt-saas/'))).toBe(true);
    await result.cleanup();
  });

  it('leaves package.json to the structured pass', async () => {
    const result = await plan(await generateProjectAtV1(['content']));
    expect(result.actions.find((action) => action.path === 'package.json')).toBeUndefined();
    await result.cleanup();
  });

  // The kit's committed package.json is the union of every module, so it changes
  // between revisions for modules this project never installed. Text-merging it
  // would put those dependencies back.
  it('leaves it to the structured pass even when no installed module declares it', async () => {
    const result = await plan(await generateProjectAtV1(['base']));
    expect(result.actions.find((action) => action.path === 'package.json')).toBeUndefined();
    expect(result.structuredTargets).toContain('package.json');
    await result.cleanup();
  });

  it('still records ownership and hashes for structured targets', async () => {
    const result = await plan(await generateProjectAtV1(['content']));
    expect(result.targetOwners['package.json']).toBe('base');
    expect(result.targetHashes['package.json']).toMatch(/^sha256:/);
    await result.cleanup();
  });

  it('respects files the user deleted', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await rm(join(projectRoot, 'app/pages/index.vue'));
    await commitAll(projectRoot);

    const result = await plan(projectRoot);
    const action = actionFor(result.actions, 'app/pages/index.vue');
    expect(action.type).toBe('skip');
    if (action.type !== 'skip') return;
    expect(action.reason).toMatch(/deleted/);
    await result.cleanup();
  });
});
