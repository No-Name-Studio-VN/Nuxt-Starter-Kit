import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli';

describe('temporary CLI entrypoint', () => {
  it('prints usage instead of dispatching to the removed engine', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(await main(['modules'])).toBe(0);
      expect(log.mock.calls.flat().join('\n')).toContain('Usage: nuxt-saas');
    } finally {
      log.mockRestore();
    }
  });
});
