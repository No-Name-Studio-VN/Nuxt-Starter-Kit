import { resolve } from 'node:path';
import { CliError } from '../errors';
import { commitSnapshot, git, snapshotTree, workTree } from '../git/snapshot';
import type { KitOptions } from '../types/cli';
import { assertSameKitMajor, parseTemplate, resolveCommit, type KitSnapshot, type KitSource } from './source';

export function kitSource(args: KitOptions, template: string): KitSource {
  if (args['use-uncommitted-kit'] && !args.kit) {
    throw new CliError('--use-uncommitted-kit requires --kit <path>.');
  }
  const parsed = parseTemplate(template);
  return args.kit
    ? { kind: 'local', path: resolve(args.kit), allowDirty: args['allow-dirty-kit'] || args['use-uncommitted-kit'] }
    : { kind: 'github', ...parsed };
}

export async function targetCommit(
  source: KitSource,
  ref: string | undefined,
  uncommitted = false,
  upgradeFrom?: KitSnapshot,
): Promise<string> {
  if (uncommitted) {
    if (ref !== undefined) throw new CliError('--use-uncommitted-kit cannot be combined with --to.');
    if (source.kind !== 'local') throw new CliError('--use-uncommitted-kit requires --kit <path>.');
    const repo = await workTree(source.path);
    if (!repo?.head || repo.prefix) throw new CliError('--kit must point to the root of a git checkout with a commit.');
    if (upgradeFrom) {
      await assertSameKitMajor(upgradeFrom, { dir: repo.root, commit: 'the local kit worktree' });
    }
    const tree = await snapshotTree(repo, repo.head);
    const commit = await commitSnapshot(repo, tree, [repo.head], 'nuxt-saas snapshot of uncommitted kit changes');
    await git(repo.root, ['update-ref', `refs/nuxt-saas/kit-snapshots/${commit}`, commit]);
    return commit;
  }
  if (source.kind === 'github') {
    return resolveCommit({ ...source, ref: ref ?? source.ref });
  }
  const head = await resolveCommit(source);
  if (!ref) return head;
  try {
    const stdout = await git(source.path, [
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${ref}^{commit}`,
    ]);
    const commit = stdout.trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full commit SHA.');
    return commit;
  } catch (error) {
    throw new CliError(
      `Unable to resolve local kit ref "${ref}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
