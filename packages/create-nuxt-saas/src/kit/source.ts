import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { downloadTemplate } from 'giget';
import { z } from 'zod';
import { CliError } from '../errors';
import { git } from '../git/snapshot';
import { cleanupOnTermination } from '../util/terminationCleanup';
import { readKitConfig } from './config';
import { readKitModules, type KitModule } from './modules';

export type KitSource =
  | { kind: 'github'; repo: string; ref: string }
  | { kind: 'local'; path: string; allowDirty: boolean };

export const DEFAULT_TEMPLATE = 'github:No-Name-Studio-VN/Nuxt-Starter-Kit';
// A local source must not fetch missing objects on demand in a partial clone.
export const LOCAL_KIT_GIT_ENV = { GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '' };

export interface KitSnapshot {
  dir: string;
  commit: string;
  template: string;
  modules: KitModule[];
  groups?: string[] | undefined;
  cleanup(): Promise<void>;
}

const run = promisify(execFile);
const shaPattern = /^[a-f0-9]{40}$/;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseTemplate(template: string): { repo: string; ref: string } {
  const match = /^github:([\w.-]+\/[\w.-]+)(?:#([^#\s]+))?$/.exec(template);
  const repo = match?.[1];
  if (!repo) throw new CliError(`Invalid template "${template}". Use github:owner/repo#ref.`);
  return { repo, ref: match[2] ?? 'main' };
}

export async function resolveCommit(source: KitSource): Promise<string> {
  if (source.kind === 'local') {
    try {
      const status = await git(source.path, ['status', '--porcelain'], LOCAL_KIT_GIT_ENV);
      if (status.trim() && !source.allowDirty) {
        throw new CliError(
          `Kit at ${source.path} has uncommitted changes. Commit them or use --allow-dirty-kit.`,
        );
      }
      const commit = (await git(source.path, ['rev-parse', 'HEAD'], LOCAL_KIT_GIT_ENV)).trim();
      if (!shaPattern.test(commit))
        throw new CliError(`Invalid commit returned by kit at ${source.path}.`);
      return commit;
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError(`Unable to resolve kit at ${source.path}: ${errorMessage(error)}`);
    }
  }

  const label = `${source.repo}#${source.ref}`;
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const response = await fetch(
      `https://api.github.com/repos/${source.repo}/commits/${encodeURIComponent(source.ref)}`,
      {
        headers,
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.status !== 200) {
      throw new CliError(`Unable to resolve kit ${label}: HTTP ${response.status}.`);
    }
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('sha' in body) ||
      typeof body.sha !== 'string' ||
      !shaPattern.test(body.sha)
    ) {
      throw new CliError(
        `Unable to resolve kit ${label}: HTTP ${response.status} returned an invalid commit.`,
      );
    }
    return body.sha;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Unable to resolve kit ${label}: ${errorMessage(error)}`);
  }
}

const kitPackageSchema = z.object({
  version: z.string().regex(/^(?:0|[1-9]\d*)\.\d+\.\d+(?:[-+][\w.+-]+)?$/),
});

async function readKitMajor(kit: Pick<KitSnapshot, 'dir' | 'commit'>): Promise<number> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(kit.dir, 'package.json'), 'utf8'));
    const { version } = kitPackageSchema.parse(parsed);
    return Number.parseInt(version, 10);
  } catch (error) {
    throw new CliError(
      `Unable to read the kit version in package.json at ${kit.commit}: ${errorMessage(error)}`,
    );
  }
}

export async function assertSameKitMajor(
  from: Pick<KitSnapshot, 'dir' | 'commit'>,
  to: Pick<KitSnapshot, 'dir' | 'commit'>,
): Promise<void> {
  const [fromMajor, toMajor] = await Promise.all([readKitMajor(from), readKitMajor(to)]);
  if (fromMajor === toMajor) return;
  throw new CliError(
    `This project was generated with kit ${fromMajor}.x and cannot upgrade to kit ${toMajor}.x. Generate a new project and move your code across.`,
  );
}

export async function openKit(
  source: KitSource,
  commit: string,
  template: string,
): Promise<KitSnapshot> {
  const label = source.kind === 'local' ? source.path : source.repo;
  function unavailable(error: unknown): CliError {
    return new CliError(
      `Kit commit ${commit} from ${label} was never pushed or is unavailable. Use --kit <path> to provide a local checkout. ${errorMessage(error)}`,
    );
  }
  if (!shaPattern.test(commit))
    throw new CliError(`Invalid kit commit ${commit}. Expected a full 40-character SHA.`);
  const dir = await mkdtemp(join(tmpdir(), 'nuxt-saas-kit-'));
  const removeDir = () => rm(dir, { recursive: true, force: true });
  // A killed run (the app's cancel or timeout) never reaches `finally`, so the signal handler removes the copy.
  const stopWatching = cleanupOnTermination(removeDir);
  const cleanup = async () => {
    stopWatching();
    await removeDir();
  };
  try {
    if (source.kind === 'local') {
      try {
        await git(source.path, ['cat-file', '-e', `${commit}^{commit}`], LOCAL_KIT_GIT_ENV);
      } catch {
        throw new CliError(
          `Kit commit ${commit} is not in the local kit checkout at ${source.path}. Fetch the ref containing that commit or use --kit with another clone that has it.`,
        );
      }
      // Keep the archive outside the snapshot so only tracked kit files remain.
      const archiveDir = await mkdtemp(join(tmpdir(), 'nuxt-saas-kit-archive-'));
      const stopWatchingArchive = cleanupOnTermination(() =>
        rm(archiveDir, { recursive: true, force: true }),
      );
      try {
        const archive = join(archiveDir, 'kit.tar');
        await git(
          source.path,
          ['archive', '--format=tar', '--output', archive, commit],
          LOCAL_KIT_GIT_ENV,
        );
        await run('tar', ['-xf', archive, '-C', dir]);
      } finally {
        stopWatchingArchive();
        await rm(archiveDir, { recursive: true, force: true });
      }
    } else {
      const token = process.env.GITHUB_TOKEN;
      try {
        await downloadTemplate(`github:${source.repo}#${commit}`, {
          dir,
          ...(token ? { auth: token } : {}),
        });
      } catch (error) {
        throw unavailable(error);
      }
    }
    const config = await readKitConfig(dir);
    const modules = await readKitModules(dir, config);
    return { dir, commit, template, modules, groups: config.groups, cleanup };
  } catch (error) {
    await cleanup();
    if (error instanceof CliError) throw error;
    throw new CliError(`Unable to open kit ${label} at ${commit}: ${errorMessage(error)}`);
  }
}
