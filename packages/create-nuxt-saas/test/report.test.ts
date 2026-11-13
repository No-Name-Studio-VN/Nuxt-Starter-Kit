import { execFile } from 'node:child_process';
import { mkdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir } from './support/fixtureKit';
import { printInitReport, printModules, printTransitionReport } from '../src/report';
import type { KitModule } from '../src/kit/modules';

afterEach(() => vi.restoreAllMocks());

describe('reports', () => {
  it('prints a cd step that preserves shell metacharacters in the target path', async () => {
    const parent = await makeTempDir('report');
    const target = join(parent, "a '$HOME `pwd` project");
    try {
      await mkdir(target);
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      printInitReport({ target, modules: [], git: 'skipped', followUps: [] });
      const step = log.mock.calls
        .flat()
        .find((line) => typeof line === 'string' && line.trim().startsWith('cd '));
      expect(typeof step).toBe('string');
      if (typeof step !== 'string') throw new Error('Missing cd step');
      const { stdout } = await promisify(execFile)('sh', ['-c', `${step} && pwd -P`]);
      expect(stdout.trim()).toBe(await realpath(target));
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('formats padded change rows, conflicts and follow-ups after a preview notice', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTransitionReport(
      {
        changes: [
          { kind: 'create', path: 'new.txt' },
          { kind: 'conflict', path: 'edited.txt' },
          { kind: 'keep-protected', path: '.env' },
        ],
        conflicts: ['edited.txt'],
        followUps: ['pnpm install'],
        addedModules: [],
        removedModules: [],
        applied: false,
      },
      true,
    );
    const lines = log.mock.calls.flat().join('\n');
    expect(lines.startsWith('Preview — nothing was written.')).toBe(true);
    expect(lines).toContain('+ create         new.txt');
    expect(lines).toContain('! conflict       edited.txt');
    expect(lines).toContain('= keep-protected .env');
    expect(lines.indexOf('Conflicts:')).toBeGreaterThan(lines.indexOf('keep-protected'));
    expect(lines.indexOf('Next:')).toBeGreaterThan(lines.indexOf('Conflicts:'));
    expect(lines).toContain('pnpm install');
  });

  it('includes the absolute init target, resolved modules and development steps', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    printInitReport({
      target: '/tmp/new project',
      modules: ['alpha', 'beta'],
      git: 'committed',
      followUps: ['pnpm install'],
    });
    const text = log.mock.calls.flat().join('\n');
    expect(text).toContain('/tmp/new project');
    expect(text).toContain('alpha, beta');
    expect(text).toContain('committed');
    expect(text).toContain('pnpm dev');
    expect(text.indexOf('cd ')).toBeLessThan(text.indexOf('pnpm install'));
  });

  it('shows internal modules in the listing and marks installed ones', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const module: KitModule = {
      id: 'core',
      title: 'Core',
      description: 'Internal infrastructure',
      internal: true,
      requires: [],
      dependencies: [],
      devDependencies: [],
      scripts: [],
      env: [],
      bindings: [],
      rootFiles: [],
    };
    printModules([module], ['core']);
    expect(log.mock.calls.flat().join('\n')).toMatch(/core.*installed.*internal/);
  });
});
