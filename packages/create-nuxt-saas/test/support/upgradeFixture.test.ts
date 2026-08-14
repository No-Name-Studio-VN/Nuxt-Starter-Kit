import { describe, expect, it } from 'vitest';
import { readManifest } from '../../src/manifest/io';
import { editFile, generateProjectAtV1, readProjectFile } from './upgradeFixture';

describe('generateProjectAtV1', () => {
  it('produces a committed project pinned at revision v1', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    const manifest = await readManifest(projectRoot);
    expect(manifest.kit.revision).toBe('v1');
    expect(manifest.modules.map((module) => module.id)).toEqual(['base', 'content']);
    expect(await readProjectFile(projectRoot, 'app/legacy.ts')).toContain('v1');
  });

  it('supports editing a project file', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(
      projectRoot,
      'app/pages/index.vue',
      '<template>\n  <h1>Mine</h1>\n</template>\n',
    );
    expect(await readProjectFile(projectRoot, 'app/pages/index.vue')).toContain('Mine');
  });
});
