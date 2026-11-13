import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { downloadTemplate } from 'giget';
import { CliError } from '../errors';
import { readKitModules, type KitModule } from './modules';

export type KitSource =
  | { kind: 'github'; repo: string; ref: string }
  | { kind: 'local'; path: string; allowDirty: boolean };

export const DEFAULT_TEMPLATE = 'github:No-Name-Studio-VN/Nuxt-Starter-Kit';

export interface KitSnapshot {
  dir: string;
  commit: string;
  template: string;
  modules: KitModule[];
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
      const { stdout: status } = await run('git', ['-C', source.path, 'status', '--porcelain']);
      if (status.trim() && !source.allowDirty) {
        throw new CliError(
          `Kit at ${source.path} has uncommitted changes. Commit them or use --allow-dirty-kit.`,
        );
      }
      const { stdout } = await run('git', ['-C', source.path, 'rev-parse', 'HEAD']);
      const commit = stdout.trim();
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
  if (!shaPattern.test(commit)) throw unavailable('Expected a full 40-character SHA.');
  const dir = await mkdtemp(join(tmpdir(), 'nuxt-saas-kit-'));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    if (source.kind === 'local') {
      // Keep the archive outside the snapshot so only tracked kit files remain.
      const archiveDir = await mkdtemp(join(tmpdir(), 'nuxt-saas-kit-archive-'));
      try {
        const archive = join(archiveDir, 'kit.tar');
        try {
          await run('git', [
            '-C',
            source.path,
            'archive',
            '--format=tar',
            '--output',
            archive,
            commit,
          ]);
        } catch (error) {
          throw unavailable(error);
        }
        await run('tar', ['-xf', archive, '-C', dir]);
      } finally {
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
    const modules = await readKitModules(dir);
    return { dir, commit, template, modules, cleanup };
  } catch (error) {
    await cleanup();
    if (error instanceof CliError) throw error;
    throw new CliError(`Unable to open kit ${label} at ${commit}: ${errorMessage(error)}`);
  }
}
