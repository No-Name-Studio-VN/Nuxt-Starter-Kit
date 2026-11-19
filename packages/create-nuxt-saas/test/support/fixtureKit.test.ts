import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
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
});
