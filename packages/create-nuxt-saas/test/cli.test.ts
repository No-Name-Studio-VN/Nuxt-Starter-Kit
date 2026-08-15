import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { main, nextSteps, resolveInitTarget, withDefaultCommand } from '../src/cli';
import { DEFAULT_PROJECT_NAME, sanitizeProjectName } from '../src/util/projectName';

describe('main', () => {
  it('reports CliError messages without a stack trace and exits non-zero', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main([
      'init',
      join(tmpdir(), `nsk-cli-test-${Date.now()}`),
      '--modules',
      'not-a-module',
      '--yes',
    ]);
    expect(exitCode).toBe(1);
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/Unknown module "not-a-module"/);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toMatch(/at .*cli\.ts/);
    errorSpy.mockRestore();
  });

  it('lists modules from the bundled registry', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitCode = await main(['modules']);
    expect(exitCode).toBe(0);
    expect(logSpy.mock.calls.flat().join(' ')).toMatch(/^base@/);
    logSpy.mockRestore();
  });
});

describe('usage', () => {
  // citty renders usage through its own writer, so this asserts the behaviour
  // that matters: no unhandled crash, and a non-zero exit code.
  it('shows help instead of crashing when help is asked for', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(main(['--help'])).resolves.toBe(1);
    logSpy.mockRestore();
  });
});

describe('withDefaultCommand', () => {
  it.each([
    [[], ['init']],
    [['my-app'], ['init', 'my-app']],
    [['./apps/web'], ['init', './apps/web']],
    [['--yes'], ['init', '--yes']],
    [
      ['--modules', 'pwa'],
      ['init', '--modules', 'pwa'],
    ],
  ])('routes %j to init', (argv, expected) => {
    expect(withDefaultCommand(argv)).toEqual(expected);
  });

  it.each([
    [['init', 'my-app']],
    [['add', 'pwa']],
    [['remove', 'pwa']],
    [['upgrade', '--check']],
    [['status']],
    [['diff']],
    [['modules']],
  ])('leaves the explicit subcommand %j alone', (argv) => {
    expect(withDefaultCommand(argv)).toEqual(argv);
  });

  it.each([[['--help']], [['-h']]])('lets %j reach the root command for usage', (argv) => {
    expect(withDefaultCommand(argv)).toEqual(argv);
  });
});

describe('resolveInitTarget', () => {
  it('creates a folder named after the project when no directory is given', async () => {
    await expect(resolveInitTarget(undefined, false)).resolves.toEqual({
      dir: DEFAULT_PROJECT_NAME,
      name: DEFAULT_PROJECT_NAME,
    });
  });

  it('treats an empty directory argument as no directory', async () => {
    await expect(resolveInitTarget('', false)).resolves.toEqual({
      dir: DEFAULT_PROJECT_NAME,
      name: DEFAULT_PROJECT_NAME,
    });
  });

  it('keeps the directory as written and derives the name from it', async () => {
    await expect(resolveInitTarget('my-app', false)).resolves.toEqual({
      dir: 'my-app',
      name: 'my-app',
    });
    await expect(resolveInitTarget('./apps/web', false)).resolves.toEqual({
      dir: './apps/web',
      name: 'web',
    });
  });

  /**
   * A directory the user already has is not a prompt they can correct, so its
   * name is coerced rather than rejected.
   */
  it('sanitises a directory name that is not a valid package name', async () => {
    await expect(resolveInitTarget('./apps/My App', false)).resolves.toEqual({
      dir: './apps/My App',
      name: 'my-app',
    });
  });

  it('resolves "." against the working directory', async () => {
    await expect(resolveInitTarget('.', false)).resolves.toEqual({
      dir: '.',
      name: sanitizeProjectName(basename(resolve('.'))),
    });
  });
});

describe('nextSteps', () => {
  it('tells the user to enter the new directory first', () => {
    expect(nextSteps(resolve('my-app'))).toEqual(['cd my-app', 'npm install', 'npm run dev']);
  });

  it('omits cd when the project is the working directory', () => {
    expect(nextSteps(resolve('.'))).toEqual(['npm install', 'npm run dev']);
  });
});
