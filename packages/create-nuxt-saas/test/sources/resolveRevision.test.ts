import { afterEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/errors';
import { isCommitId, localKitOption, resolveRevision } from '../../src/sources/resolveRevision';

const TEMPLATE = 'github:owner/repo';
const SHA = 'a'.repeat(40);

afterEach(() => {
  vi.unstubAllGlobals();
});

interface StubbedResponse {
  ok?: boolean;
  status?: number;
  body?: string;
}

function stubFetch(response: StubbedResponse) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    text: async () => response.body ?? '',
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('isCommitId', () => {
  it.each([SHA, '2f7f65d', '0123456789abcdef'])('accepts %s', (value) => {
    expect(isCommitId(value)).toBe(true);
  });

  it.each(['main', 'next', 'v2.2.1', 'release/1.x', 'abc', 'MAIN'])(
    'rejects %s',
    (value) => {
      expect(isCommitId(value)).toBe(false);
    },
  );
});

describe('resolveRevision', () => {
  it('pins a branch to the commit it points at', async () => {
    const fetchMock = stubFetch({ body: `${SHA}\n` });

    expect(await resolveRevision({ template: TEMPLATE, revision: 'main' })).toBe(SHA);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/commits/main',
      expect.anything(),
    );
  });

  it('leaves a commit id alone, without asking the network', async () => {
    const fetchMock = stubFetch({ body: 'unused' });

    expect(await resolveRevision({ template: TEMPLATE, revision: '2f7f65d' })).toBe('2f7f65d');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The declared revision is only a label for whatever is on disk.
  it('leaves a branch alone when a local checkout is given', async () => {
    const fetchMock = stubFetch({ body: SHA });

    expect(
      await resolveRevision({ template: TEMPLATE, revision: 'main', localKitRoot: '/tmp/kit' }),
    ).toBe('main');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports what GitHub said when the ref does not exist', async () => {
    stubFetch({ ok: false, status: 404 });

    await expect(resolveRevision({ template: TEMPLATE, revision: 'nope' })).rejects.toThrow(
      /answered 404/,
    );
  });

  it('mentions GITHUB_TOKEN when rate limited', async () => {
    stubFetch({ ok: false, status: 403 });

    await expect(resolveRevision({ template: TEMPLATE, revision: 'main' })).rejects.toThrow(
      /GITHUB_TOKEN/,
    );
  });

  it('refuses a branch on a template it cannot resolve', async () => {
    await expect(
      resolveRevision({ template: 'gitlab:owner/repo', revision: 'main' }),
    ).rejects.toThrow(CliError);
  });

  it('still pins a commit id on a template it cannot resolve', async () => {
    expect(await resolveRevision({ template: 'gitlab:owner/repo', revision: '2f7f65d' })).toBe(
      '2f7f65d',
    );
  });

  it('rejects a body that is not a commit', async () => {
    stubFetch({ body: '<!doctype html>' });

    await expect(resolveRevision({ template: TEMPLATE, revision: 'main' })).rejects.toThrow(
      /not a commit/,
    );
  });
});

describe('localKitOption', () => {
  it('omits the property rather than setting it undefined', () => {
    expect(localKitOption(undefined, 'main')).toEqual({});
    expect(localKitOption(() => undefined, 'main')).toEqual({});
    expect('localKitRoot' in localKitOption(() => undefined, 'main')).toBe(false);
  });

  it('passes the checkout through', () => {
    expect(localKitOption((revision) => `/kits/${revision}`, 'main')).toEqual({
      localKitRoot: '/kits/main',
    });
  });
});
