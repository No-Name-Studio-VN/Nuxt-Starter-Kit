import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdtemp, readlink, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { hasSymbolicLink } from '../util/fs';
import { cleanupOnTermination } from '../util/terminationCleanup';

const run = promisify(execFile);
const timeout = 30_000;
const maxBuffer = 32 * 1024 * 1024;
const repositoryEnv = [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
];

export interface WorkTree {
  root: string;
  gitDir: string;
  prefix: string;
  head: string | null;
}

function gitEnvironment(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !repositoryEnv.includes(key)),
  );
  return { ...cleanEnv, GIT_NO_REPLACE_OBJECTS: '1', ...env };
}

function gitArgs(root: string, args: string[]): string[] {
  return [
    '--no-optional-locks',
    '--literal-pathspecs',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'core.splitIndex=false',
    '-C',
    root,
    ...args,
  ];
}

async function gitOutput(
  root: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  input?: string | Buffer,
): Promise<Buffer> {
  const child = run('git', gitArgs(root, args), {
    env: gitEnvironment(env),
    encoding: 'buffer',
    timeout,
    maxBuffer,
  });
  if (input !== undefined) {
    child.child.stdin?.on('error', () => {});
    child.child.stdin?.end(input);
  }
  return (await child).stdout;
}

export async function git(
  root: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  input?: string | Buffer,
): Promise<string> {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    await gitOutput(root, args, env, input),
  );
}

export function splitPaths(output: string): string[] {
  return output.split('\0').filter(Boolean);
}

export async function workTree(projectRoot: string): Promise<WorkTree | null> {
  const inside = await git(projectRoot, ['rev-parse', '--is-inside-work-tree']).catch(() => '');
  if (inside.trim() !== 'true') return null;
  const root = (await git(projectRoot, ['rev-parse', '--show-toplevel'])).replace(/\n$/, '');
  const prefix = (await git(projectRoot, ['rev-parse', '--show-prefix'])).replace(/\n$/, '');
  const gitDir = (await git(root, ['rev-parse', '--absolute-git-dir'])).replace(/\n$/, '');
  const head = await git(root, ['rev-parse', '--verify', 'HEAD']).catch(() => '');
  return { root, gitDir, prefix, head: head.trim() || null };
}

export async function withSnapshotIndex<T>(
  callback: (directory: string, env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'nuxt-saas-index-'));
  const remove = () => rm(directory, { recursive: true, force: true });
  const unregister = cleanupOnTermination(remove);
  try {
    return await callback(directory, { GIT_INDEX_FILE: join(directory, 'index') });
  } finally {
    unregister();
    await remove();
  }
}

export async function indexTree(repo: WorkTree, env?: NodeJS.ProcessEnv): Promise<string | null> {
  return withSnapshotIndex(async (directory, index) => {
    const realIndex = (
      await git(repo.root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])
    ).replace(/\n$/, '');
    try {
      await copyFile(realIndex, join(directory, 'index'));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    return (
      (await git(repo.root, ['write-tree'], { ...env, ...index }).catch(() => '')).trim() || null
    );
  });
}

function fileMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

export async function snapshotTree(
  repo: WorkTree,
  seed: string | null,
  extraPaths: string[] = [],
  objects?: NodeJS.ProcessEnv,
  onlyExtraPaths = false,
  fileModes?: Map<string, number>,
): Promise<string> {
  return withSnapshotIndex(async (_, index) => {
    const env = { ...objects, ...index };
    await git(repo.root, ['read-tree', ...(seed ? [seed] : ['--empty'])], env);
    const scope = ['--', repo.prefix || '.'];
    const seeded = new Map(
      splitPaths(await git(repo.root, ['ls-files', '--stage', '-z', ...scope], env)).map(
        (entry) => {
          const separator = entry.indexOf('\t');
          return [entry.slice(separator + 1), entry.slice(0, 6)];
        },
      ),
    );
    const work = onlyExtraPaths
      ? []
      : splitPaths(
          await git(repo.root, [
            'ls-files',
            '-z',
            '--cached',
            '--others',
            '--exclude-standard',
            ...scope,
          ]),
        );
    const paths = new Set([
      ...(onlyExtraPaths ? [] : [...seeded.keys(), ...work]),
      ...extraPaths.map((path) => `${repo.prefix}${path}`),
    ]);
    const updates: string[] = [];
    const files: { path: string; mode: string }[] = [];
    const links: string[] = [];
    const format = (await git(repo.root, ['rev-parse', '--show-object-format'])).trim();
    const zero = '0'.repeat(format === 'sha256' ? 64 : 40);
    for (const path of paths) {
      if (path.endsWith('/')) continue; // Git reports embedded repositories as directories.
      const parent = join(repo.root, path, '..');
      const absolute = join(repo.root, path);
      const stats = (await hasSymbolicLink(repo.root, parent))
        ? null
        : await lstat(absolute).catch((error: unknown) => {
            if (fileMissing(error)) return null;
            throw error;
          });
      const relative = path.slice(repo.prefix.length);
      fileModes?.delete(relative);
      if (stats?.isFile()) {
        const permissions = stats.mode & 0o7777;
        const gitPermissions = permissions & 0o100 ? 0o755 : 0o644;
        files.push({ path, mode: `100${gitPermissions.toString(8)}` });
        // Git trees only retain the owner's executable bit; save other modes separately.
        if (permissions !== gitPermissions) fileModes?.set(relative, permissions);
      } else if (stats?.isSymbolicLink()) {
        const target = await readlink(absolute, { encoding: 'buffer' });
        const blob = (await git(repo.root, ['hash-object', '-w', '--stdin'], env, target)).trim();
        links.push(`120000 ${blob}\t${path}\0`);
      } else if (seeded.has(path) && !(stats?.isDirectory() && seeded.get(path) === '160000')) {
        updates.push(`0 ${zero}\t${path}\0`);
      }
    }
    if (updates.length)
      await git(repo.root, ['update-index', '-z', '--index-info'], env, updates.splice(0).join(''));
    updates.push(...links);
    // Bypass clean/smudge filters and line-ending conversion: a backup preserves disk bytes.
    for (let start = 0; start < files.length;) {
      let size = 0;
      let end = start;
      while (end < files.length && size < 64 * 1024) {
        size += Buffer.byteLength(files[end]?.path ?? '') + 1;
        end++;
      }
      const batch = files.slice(start, end);
      const hashes = (
        await git(
          repo.root,
          ['hash-object', '-w', '--no-filters', '--', ...batch.map(({ path }) => path)],
          env,
        )
      )
        .trim()
        .split('\n');
      for (const [i, { path, mode }] of batch.entries())
        updates.push(`${mode} ${hashes[i]}\t${path}\0`);
      start = end;
    }
    if (updates.length)
      await git(repo.root, ['update-index', '-z', '--index-info'], env, updates.join(''));
    return (await git(repo.root, ['write-tree'], env)).trim();
  });
}

export async function commitSnapshot(
  repo: WorkTree,
  tree: string,
  parents: string[],
  message: string,
): Promise<string> {
  return (
    await git(
      repo.root,
      [
        '-c',
        'commit.gpgsign=false',
        '-c',
        'user.name=nuxt-saas',
        '-c',
        'user.email=nuxt-saas@localhost',
        'commit-tree',
        tree,
        ...parents.flatMap((parent) => ['-p', parent]),
        '-F',
        '-',
      ],
      {
        GIT_AUTHOR_NAME: 'nuxt-saas',
        GIT_AUTHOR_EMAIL: 'nuxt-saas@localhost',
        GIT_COMMITTER_NAME: 'nuxt-saas',
        GIT_COMMITTER_EMAIL: 'nuxt-saas@localhost',
      },
      message,
    )
  ).trim();
}

export async function changedPaths(
  repo: WorkTree,
  from: string,
  to: string,
  env?: NodeJS.ProcessEnv,
): Promise<string[]> {
  if (from === to) return [];
  const paths = await git(
    repo.root,
    [
      'diff-tree',
      '-r',
      '--no-commit-id',
      '--no-renames',
      '--name-only',
      '-z',
      from,
      to,
      '--',
      repo.prefix || '.',
    ],
    env,
  );
  return splitPaths(paths).map((path) => path.slice(repo.prefix.length));
}

export async function restoreSnapshotBlob(
  repo: WorkTree,
  blob: string,
  path: string,
  mode: number,
): Promise<void> {
  const directory = await mkdtemp(join(dirname(path), '.nuxt-saas-restore-'));
  const remove = () => rm(directory, { recursive: true, force: true });
  const unregister = cleanupOnTermination(remove);
  const file = join(directory, 'file');
  try {
    const child = spawn('git', gitArgs(repo.root, ['cat-file', 'blob', blob]), {
      env: gitEnvironment(),
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const exit = new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0) resolve();
        else
          reject(new Error(`Cannot read backup blob ${blob}: git exited with ${signal ?? code}.`));
      });
    });
    await Promise.all([
      exit,
      pipeline(child.stdout, createWriteStream(file, { mode: 0o600, flags: 'wx' })),
    ]);
    await chmod(file, mode);
    await rename(file, path);
  } finally {
    unregister();
    await remove();
  }
}
