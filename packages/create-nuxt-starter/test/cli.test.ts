import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli';

describe('main', () => {
  it('reports CliError messages without a stack trace and exits non-zero', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main([
      'init',
      '--modules',
      'not-a-module',
      '--yes',
      '--dir',
      '/tmp/nsk-cli-test',
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
    expect(logSpy.mock.calls.flat().join(' ')).toMatch(/full-starter/);
    logSpy.mockRestore();
  });
});
