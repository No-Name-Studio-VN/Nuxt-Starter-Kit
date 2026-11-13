import { describe, expect, it } from 'vitest';
import type { Tree } from '../../src/render/render';
import { followUpsFor } from '../../src/transition/followUps';

function tree(files: Record<string, string>): Tree {
  return new Map(
    Object.entries(files).map(([path, content]) => [
      path,
      {
        content: Buffer.from(content),
        binary: false,
      },
    ]),
  );
}

describe('followUpsFor', () => {
  it('always suggests install for init, combining all env keys into one copy instruction', () => {
    const target = tree({
      '.env.example': '# Comment\nSITE_URL=\nALPHA_KEY=\nALPHA_KEY=duplicate\n',
    });
    expect(followUpsFor(null, target, [], [])).toEqual([
      'pnpm install',
      'cp .env.example .env and fill: SITE_URL, ALPHA_KEY',
    ]);
  });

  it('omits env instructions when no env keys are present', () => {
    expect(followUpsFor(null, tree({}), [], [])).toEqual(['pnpm install']);
    expect(followUpsFor(null, tree({ '.env.example': '# Only comments\n' }), [], [])).toEqual([
      'pnpm install',
    ]);
  });

  it.each([
    'server/db/schema.sqlite.ts',
    'server/db/schema.ts',
    'server/db/schema/users.ts',
    'layers/beta/server/db/schema.sqlite.ts',
    'layers/auth/server/db/schema/users.ts',
  ])('suggests generation when init contains schema %s', (path) => {
    expect(followUpsFor(null, tree({ [path]: 'schema' }), [], [])).toEqual([
      'pnpm install',
      'pnpm db:generate',
    ]);
  });

  it('suggests generation for database selection even when it owns no schema files', () => {
    expect(followUpsFor(null, tree({}), [], ['database'])).toEqual([
      'pnpm install',
      'pnpm db:generate',
    ]);
  });

  it('does not confuse similarly named files with schemas', () => {
    const target = tree({
      'server/db/schema-helper.ts': '',
      'server/db/schema/users.json': '',
      'server/db/schema/nested/users.ts': '',
      'notserver/db/schema.ts': '',
    });
    expect(followUpsFor(null, target, [], [])).toEqual(['pnpm install']);
  });

  it('reports install, changed schemas, and only newly added env keys for a transition', () => {
    const base = tree({ '.env.example': 'SITE_URL=old\nREMOVED=\n', 'package.json': 'old' });
    const target = tree({
      '.env.example': 'SITE_URL=new\nNEW_KEY=\nOTHER_KEY=\nNEW_KEY=duplicate\n',
      'package.json': 'new',
    });
    expect(
      followUpsFor(
        base,
        target,
        [
          { path: 'package.json', kind: 'merge' },
          { path: 'layers/beta/server/db/schema.sqlite.ts', kind: 'update' },
          { path: '.env.example', kind: 'merge' },
        ],
        ['beta'],
      ),
    ).toEqual(['pnpm install', 'pnpm db:generate', 'Add NEW_KEY to .env', 'Add OTHER_KEY to .env']);
  });

  it('includes deleted schemas but ignores kept changes and unchanged schemas', () => {
    const base = tree({ 'package.json': 'old' });
    const target = tree({ 'server/db/schema.ts': 'unchanged' });
    expect(
      followUpsFor(
        base,
        target,
        [
          { path: 'package.json', kind: 'keep-edited' },
          { path: 'server/db/schema.ts', kind: 'keep-protected' },
        ],
        ['database'],
      ),
    ).toEqual([]);
    expect(
      followUpsFor(
        base,
        target,
        [{ path: 'layers/removed/server/db/schema.ts', kind: 'delete' }],
        [],
      ),
    ).toEqual(['pnpm db:generate']);
  });

  it('does not suggest env keys absent from target or already present in base', () => {
    const base = tree({ '.env.example': 'EXISTING=\nREMOVED=\n' });
    const target = tree({ '.env.example': 'EXISTING=changed\n' });
    expect(followUpsFor(base, target, [{ path: '.env.example', kind: 'update' }], [])).toEqual([]);
  });
});
