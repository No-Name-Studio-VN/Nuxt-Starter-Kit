import { describe, expect, it, vi } from 'vitest';
import { fetchKit } from '../../src/sources/fetchKit';
import { FIXTURE_KIT_V1_ROOT } from '../support/fixtureKit';

vi.mock('giget', () => ({
  downloadTemplate: vi.fn(async (source: string) => ({ dir: `/downloaded/${source}` })),
}));

describe('fetchKit', () => {
  it('uses a local kit root without downloading', async () => {
    const { downloadTemplate } = await import('giget');
    const kit = await fetchKit({
      template: 'fixture',
      revision: 'v1',
      localKitRoot: FIXTURE_KIT_V1_ROOT,
    });
    expect(kit.root).toBe(FIXTURE_KIT_V1_ROOT.replace(/\/$/, ''));
    expect(downloadTemplate).not.toHaveBeenCalled();
    await kit.cleanup();
  });

  it('rejects a local kit root that does not exist', async () => {
    await expect(
      fetchKit({ template: 'fixture', revision: 'v1', localKitRoot: '/no/such/kit' }),
    ).rejects.toThrow(/\/no\/such\/kit/);
  });

  it('downloads the template pinned at the revision', async () => {
    const { downloadTemplate } = await import('giget');
    const kit = await fetchKit({ template: 'github:acme/kit', revision: 'abc1234' });
    expect(downloadTemplate).toHaveBeenCalledWith(
      'github:acme/kit#abc1234',
      expect.objectContaining({ force: true }),
    );
    expect(kit.root).toBe('/downloaded/github:acme/kit#abc1234');
  });
});
