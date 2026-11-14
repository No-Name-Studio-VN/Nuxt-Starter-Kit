import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import { composeEnvExample, composePackageJson, composeWrangler } from '../../src/render/compose';

const identity = { name: 'my-app', description: 'My project' };

describe('composePackageJson', () => {
  it('drops only claimed entries and applies identity while preserving key order', () => {
    const raw = JSON.stringify({
      name: 'kit',
      version: '9.0.0',
      private: true,
      description: 'Kit',
      dependencies: { base: '1', alpha: '2' },
      devDependencies: { alpha: '3', tool: '4' },
      scripts: { dev: 'nuxt dev', alpha: 'echo alpha' },
    });
    expect(
      composePackageJson(
        raw,
        {
          dependencies: new Set(['alpha', 'missing']),
          devDependencies: new Set(['tool']),
          scripts: new Set(['alpha']),
        },
        identity,
      ),
    ).toBe(
      `${JSON.stringify(
        {
          name: 'my-app',
          version: '0.1.0',
          private: true,
          description: 'My project',
          dependencies: { base: '1' },
          devDependencies: { alpha: '3' },
          scripts: { dev: 'nuxt dev' },
        },
        null,
        2,
      )}\n`,
    );
  });

  it('does not invent missing dependency or script sections', () => {
    expect(
      composePackageJson(
        '{}',
        {
          dependencies: new Set(['alpha']),
          devDependencies: new Set(),
          scripts: new Set(),
        },
        identity,
      ),
    ).toBe(
      `${JSON.stringify(
        {
          name: 'my-app',
          description: 'My project',
          version: '0.1.0',
        },
        null,
        2,
      )}\n`,
    );
  });
});

describe('composeEnvExample', () => {
  it('removes contiguous comments above dropped keys but preserves separated comments', () => {
    const raw =
      '# Keep overview\n\n# Alpha\n# Secret\nALPHA_KEY=value\n# Base\nBASE_KEY=one=two\n\n# Separated\n\nBETA_KEY=\n';
    expect(composeEnvExample(raw, new Set(['ALPHA_KEY', 'BETA_KEY']))).toBe(
      '# Keep overview\n\n# Base\nBASE_KEY=one=two\n\n# Separated\n',
    );
  });

  it('matches whole keys, normalizes blank runs and leaves a single trailing newline', () => {
    expect(
      composeEnvExample('ALPHA_EXTRA=\r\n\r\n\r\nALPHA=\r\n\r\nBASE=\r\n\r\n', new Set(['ALPHA'])),
    ).toBe('ALPHA_EXTRA=\n\nBASE=\n');
    expect(composeEnvExample('# Alpha\nALPHA=\n', new Set(['ALPHA']))).toBe('\n');
  });
});

describe('composeWrangler', () => {
  it('removes binding entries in reverse index order across top-level arrays and keeps unrelated comments', () => {
    const raw = `{
  // Worker comment
  "name": "kit",
  "route": "old.example/*",
  "routes": [{ "pattern": "old.example" }],
  "kv_namespaces": [
    { "binding": "DROP_ONE" },
    { "binding": "KEEP", "id": "keep-id" },
    { "binding": "DROP_TWO" },
    { "binding": "DROP_THREE" },
  ],
  // Custom bindings comment
  "custom_bindings": [{ "binding": "DROP_TWO" }, { "value": "unclaimed" }],
  "assets": { "binding": "DROP_ONE" },
  "nested": { "arrays": [{ "binding": "DROP_TWO" }] },
  // Observability comment
  "observability": { "enabled": true },
}
`;
    const output = composeWrangler(raw, new Set(['DROP_ONE', 'DROP_TWO', 'DROP_THREE']), identity);
    const value: unknown = parse(output);
    expect(value).toEqual({
      name: 'my-app',
      kv_namespaces: [{ binding: 'KEEP', id: 'keep-id' }],
      custom_bindings: [{ value: 'unclaimed' }],
      assets: { binding: 'DROP_ONE' },
      nested: { arrays: [{ binding: 'DROP_TWO' }] },
      observability: { enabled: true },
    });
    expect(output).toContain('// Worker comment');
    expect(output).toContain('// Custom bindings comment');
    expect(output).toContain('// Observability comment');
  });

  it('keeps unclaimed binding arrays and adds a missing worker name', () => {
    const value: unknown = parse(
      composeWrangler('{"queues":[{"binding":"QUEUE"}]}', new Set(), identity),
    );
    expect(value).toEqual({ queues: [{ binding: 'QUEUE' }], name: 'my-app' });
  });
});
