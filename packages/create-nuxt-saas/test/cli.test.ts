import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isHelpRequest, main, nextSteps, resolveInitTarget, withDefaultCommand } from '../src/cli';
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
  // citty renders usage through its own writer rather than console.log, so these
  // assert the behaviour that matters: help exits cleanly and, crucially, does
  // not do the thing it was asked to describe.
  it.each([[['--help']], [['-h']], [['init', '--help']], [['upgrade', '--help']]])(
    'answers %j without running anything',
    async (argv) => {
      await expect(main(argv)).resolves.toBe(0);
    },
  );

  /**
   * citty passes `--help` through as an ordinary argument, so before this was
   * intercepted `nuxt-saas my-app --help` generated a project called `my-app`
   * instead of explaining how to generate one.
   */
  it.each([[['my-app', '--help']], [['--help', 'my-app']]])(
    'does not scaffold for %j',
    async (argv) => {
      await expect(main(argv)).resolves.toBe(0);
      expect(existsSync(resolve('my-app'))).toBe(false);
    },
  );
});

describe('isHelpRequest', () => {
  it.each([[['--help']], [['-h']], [['init', '--help']], [['my-app', '-h']]])(
    'recognises %j',
    (argv) => {
      expect(isHelpRequest(argv)).toBe(true);
    },
  );

  it.each([[['init', 'my-app']], [[]], [['--yes']]])('does not misread %j', (argv) => {
    expect(isHelpRequest(argv)).toBe(false);
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

  it.each([[['--help']], [['-h']]])('lets a bare %j reach the root command for usage', (argv) => {
    expect(withDefaultCommand(argv)).toEqual(argv);
  });

  /**
   * A help flag next to a directory is asking about the command that directory
   * belongs to. Routing it to the root instead made citty reject the directory
   * as an unknown subcommand.
   */
  it.each([
    [
      ['my-app', '--help'],
      ['init', 'my-app', '--help'],
    ],
    [
      ['-h', 'my-app'],
      ['init', '-h', 'my-app'],
    ],
  ])('routes %j to init rather than the root command', (argv, expected) => {
    expect(withDefaultCommand(argv)).toEqual(expected);
  });

  it('still lets an explicit subcommand handle its own help', () => {
    expect(withDefaultCommand(['add', '--help'])).toEqual(['add', '--help']);
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

  /** `cd my app` is two arguments; the suggestion has to be pasteable. */
  it('quotes a directory the shell would otherwise split', () => {
    expect(nextSteps(resolve('my app'))).toEqual(["cd 'my app'", 'npm install', 'npm run dev']);
  });

  it('escapes a quote inside the directory name', () => {
    expect(nextSteps(resolve("it's"))[0]).toBe("cd 'it'\\''s'");
  });

  it('leaves an ordinary nested path unquoted', () => {
    expect(nextSteps(resolve('apps/web'))[0]).toBe('cd apps/web');
  });
});
