import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { writeJsonAtomically, writeTextFile } from '../../src/util/fs';

const run = promisify(execFile);

export function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `nsk-${prefix}-`));
}

/** A small, reproducible upstream for render and transition tests. HEAD is v2. */
export async function createFixtureKit(): Promise<{ root: string; v1: string; v2: string }> {
  const root = await makeTempDir('fixture-kit');
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
  };
  async function git(...args: string[]): Promise<string> {
    const { stdout } = await run(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.autocrlf=false',
        '-c',
        'init.templateDir=',
        '-C',
        root,
        ...args,
      ],
      { env },
    );
    return stdout.trim();
  }
  const packageJson = {
    name: 'fixture-kit',
    description: 'A fixture SaaS kit',
    private: true,
    scripts: { dev: 'nuxt dev', 'alpha:run': 'echo alpha' },
    dependencies: { 'base-dep': '1.0.0', 'alpha-dep': '1.0.0', 'beta-dep': '1.0.0' },
  };
  const alpha = {
    title: 'Alpha',
    description: 'Alpha features',
    dependencies: ['alpha-dep'],
    scripts: ['alpha:run'],
    env: ['ALPHA_KEY'],
    bindings: ['DB'],
  };
  const wrangler = `{
  // Fixture worker configuration; preserve comments when composing it.
  "name": "fixture-kit",
  "main": ".output/server/index.mjs",
  "compatibility_date": "2025-01-01",
  "routes": [
    { "pattern": "fixture.example.invalid", "custom_domain": true }
  ],
  "d1_databases": [
    { "binding": "DB", "database_name": "fixture-db", "database_id": "fixture-db-id" }
  ],
  "kv_namespaces": [
    { "binding": "KV", "id": "fixture-kv-id" }
  ]
}
`;
  try {
    await git('init', '--initial-branch=main', '--object-format=sha1');
    await writeJsonAtomically(join(root, 'package.json'), packageJson);
    await writeTextFile(
      join(root, '.env.example'),
      'SITE_URL=\n# Alpha configuration\nALPHA_KEY=\n',
    );
    await writeTextFile(join(root, 'wrangler.jsonc'), wrangler);
    await writeTextFile(
      join(root, 'app/pages/index.vue'),
      '<template>\n  <h1>Home v1</h1>\n</template>\n',
    );
    await writeTextFile(join(root, 'README.md'), '# Fixture kit\n');
    await writeTextFile(join(root, 'docs/x.md'), '# Excluded documentation\n');
    await mkdir(join(root, 'public'), { recursive: true });
    await writeFile(
      join(root, 'public/logo.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0x0d, 0x0a]),
    );
    await writeJsonAtomically(join(root, 'packages/create-nuxt-saas/kit.json'), {
      exclude: ['packages/**', 'docs/**', 'server/db/migrations/**'],
    });
    await writeTextFile(
      join(root, 'packages/create-nuxt-saas/templates/README.md'),
      '# {{name}}\n\n{{description}}\n\nModules: {{modules}}\n',
    );
    await writeTextFile(join(root, 'content/hello.md'), '# Hello\n');
    await writeJsonAtomically(join(root, 'layers/alpha/module.json'), alpha);
    await writeTextFile(
      join(root, 'layers/alpha/app/pages/alpha.vue'),
      '<template>\n  <h1>Alpha v1</h1>\n</template>\n',
    );
    await writeJsonAtomically(join(root, 'layers/beta/module.json'), {
      title: 'Beta',
      description: 'Beta features',
      requires: ['alpha'],
      dependencies: ['beta-dep'],
      bindings: ['KV'],
    });
    await writeTextFile(
      join(root, 'layers/beta/server/db/schema.sqlite.ts'),
      "export const betaTable = { name: 'beta', version: 1 };\n",
    );
    await writeJsonAtomically(join(root, 'layers/docs/module.json'), {
      title: 'Docs',
      description: 'Documentation content',
      rootFiles: ['content/**'],
    });
    await git('add', '.');
    await git('commit', '-m', 'fixture: v1');
    const v1 = await git('rev-parse', 'HEAD');

    await writeTextFile(
      join(root, 'app/pages/index.vue'),
      '<template>\n  <h1>Home v2</h1>\n</template>\n',
    );
    await writeTextFile(
      join(root, 'layers/alpha/app/pages/alpha.vue'),
      '<template>\n  <h1>Alpha v2</h1>\n</template>\n',
    );
    await writeTextFile(
      join(root, 'app/pages/new.vue'),
      '<template><h1>New in v2</h1></template>\n',
    );
    await rm(join(root, 'README.md'));
    await writeTextFile(
      join(root, 'layers/beta/server/db/schema.sqlite.ts'),
      "export const betaTable = { name: 'beta', version: 2 };\n",
    );
    await writeTextFile(
      join(root, '.env.example'),
      'SITE_URL=\n# Alpha configuration\nALPHA_KEY=\nALPHA_SECOND=\n',
    );
    await writeJsonAtomically(join(root, 'layers/alpha/module.json'), {
      ...alpha,
      env: ['ALPHA_KEY', 'ALPHA_SECOND'],
    });
    await writeJsonAtomically(join(root, 'package.json'), {
      ...packageJson,
      dependencies: { ...packageJson.dependencies, 'base-dep': '2.0.0' },
    });
    await writeTextFile(
      join(root, 'wrangler.jsonc'),
      wrangler.replace('  ]\n}', '  ],\n  "compatibility_flags": ["nodejs_compat"]\n}'),
    );
    await git('add', '-A');
    await git('commit', '-m', 'fixture: v2');
    const v2 = await git('rev-parse', 'HEAD');
    return { root, v1, v2 };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
