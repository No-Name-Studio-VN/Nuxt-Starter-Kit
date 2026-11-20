import { lstat, mkdir, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { CliError } from '../errors';
import {
  changedPaths, commitSnapshot, git, indexTree, restoreSnapshotBlob, snapshotTree, splitPaths,
  withSnapshotIndex, workTree, type WorkTree,
} from '../git/snapshot';
import { JSON_SCHEMA, type JsonBackup, type JsonSavedReport, type JsonUndoReport } from '../types/json';
import { hasSymbolicLink, pruneEmptyDirectories } from '../util/fs';
import { resolveInside } from '../util/paths';
import { assertReportPaths, removeReportFiles } from '../transition/savedReport';

const active = 'refs/nuxt-saas/backups/';
const undone = 'refs/nuxt-saas/undone/';
const retention = 14 * 24 * 60 * 60 * 1000;
const metadataLabel = 'nuxt-saas-backup: ';
const objectId = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const metadataSchema = z.object({
  version: z.literal(1),
  command: z.enum(['upgrade', 'add', 'remove']),
  status: z.enum(['pending', 'complete', 'failed']),
  createdAt: z.iso.datetime(),
  head: objectId.nullable(),
  index: objectId.nullable(),
  prefix: z.string(),
  gitDir: z.string().optional(),
  from: objectId,
  to: objectId,
  fileModes: z.array(z.tuple([z.string(), z.int().min(0).max(0o7777)])).optional(),
});

type BackupMetadata = z.infer<typeof metadataSchema>;

interface BackupRecord {
  ref: string;
  commit: string;
  metadata: BackupMetadata;
}

function describeBackup({ ref, metadata }: BackupRecord): JsonBackup {
  return {
    ref,
    name: ref.slice(ref.lastIndexOf('/') + 1),
    createdAt: metadata.createdAt,
    expiresAt: new Date(Date.parse(metadata.createdAt) + retention).toISOString(),
    status: ref.startsWith(undone) ? 'restored' : metadata.status,
  };
}

function parseBackupMetadata(body: string | undefined): BackupMetadata | undefined {
  const line = body?.split('\n').find((line) => line.startsWith(metadataLabel));
  if (!line) return;
  try {
    const data: unknown = JSON.parse(line.slice(metadataLabel.length));
    return metadataSchema.safeParse(data).data;
  } catch {
    // Ignore refs that cannot be identified as backups made by this CLI.
  }
}

async function backupRecords(repo: WorkTree): Promise<BackupRecord[]> {
  const refs = await git(repo.root, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(body)%00', active, undone]);
  const parts = refs.split('\0');
  const backups: BackupRecord[] = [];
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const ref = parts[i]?.trim();
    const commit = parts[i + 1];
    const metadata = parseBackupMetadata(parts[i + 2]);
    if (ref && commit && metadata?.prefix === repo.prefix &&
      (metadata.gitDir === undefined || metadata.gitDir === repo.gitDir)) {
      backups.push({ ref, commit, metadata });
    }
  }
  return backups.sort((a, b) => b.metadata.createdAt.localeCompare(a.metadata.createdAt) ||
    b.ref.localeCompare(a.ref, 'en', { numeric: true }));
}

export async function listBackups(projectRoot: string): Promise<JsonBackup[]> {
  const repo = await workTree(projectRoot);
  if (!repo) return [];
  return (await backupRecords(repo)).map(describeBackup);
}

export async function pruneBackups(repo: WorkTree): Promise<void> {
  const cutoff = Date.now() - retention;
  for (const { ref, commit, metadata } of await backupRecords(repo).catch(() => [])) {
    if (Date.parse(metadata.createdAt) < cutoff) {
      await git(repo.root, ['update-ref', '-d', ref, commit]).catch(() => {});
    }
  }
}

async function saveSnapshot(
  repo: WorkTree,
  tree: string,
  parent: string | null,
  metadata: BackupMetadata,
  versions: { fromVersion: string | null; toVersion: string | null },
): Promise<string> {
  const from = versions.fromVersion ?? metadata.from.slice(0, 7);
  const to = versions.toVersion ?? metadata.to.slice(0, 7);
  const step = metadata.status === 'pending' ? 'before' : 'after';
  const parents = parent ? [parent] : [];
  if (metadata.index && metadata.status !== 'pending') {
    // A SHA in commit text is not a GC root. Anchor the staged tree without changing the first parent.
    parents.push(await commitSnapshot(repo, metadata.index, [], 'nuxt-saas staged index'));
  }
  return commitSnapshot(repo, tree, parents,
    `nuxt-saas backup ${step} ${metadata.command} ${from} → ${to}\n\n${metadataLabel}${JSON.stringify(metadata)}`);
}

export async function beginBackup(
  repo: WorkTree,
  report: JsonSavedReport,
  paths: string[],
): Promise<BackupRecord> {
  const metadata: BackupMetadata = {
    version: 1,
    command: report.command,
    status: 'pending',
    createdAt: report.createdAt,
    head: repo.head,
    index: await indexTree(repo),
    prefix: repo.prefix,
    gitDir: repo.gitDir,
    from: report.from,
    to: report.to,
  };
  const fileModes = new Map<string, number>();
  const tree = await snapshotTree(repo, repo.head, paths, undefined, false, fileModes);
  metadata.fileModes = [...fileModes];
  const commit = await saveSnapshot(repo, tree, repo.head, metadata, report);
  const timestamp = metadata.createdAt.replace(/:|\.\d{3}/g, '');
  for (let attempt = 1; ; attempt++) {
    const name = attempt === 1 ? timestamp : `${timestamp}-${attempt}`;
    const ref = `${active}${name}`;
    const existing = splitPaths((await git(repo.root, ['for-each-ref', '--format=%(refname)%00', ref, `${undone}${name}`])).replaceAll('\n', ''));
    if (existing.includes(ref) || existing.includes(`${undone}${name}`)) continue;
    try {
      await git(repo.root, ['update-ref', ref, commit, '']);
      return { ref, commit, metadata };
    } catch (error) {
      const exists = await git(repo.root, ['show-ref', '--verify', '--quiet', ref]).then(() => true, () => false);
      if (!exists) throw error;
    }
  }
}

export async function finishBackup(
  repo: WorkTree,
  before: BackupRecord,
  report: JsonSavedReport,
  paths: string[],
  status: 'complete' | 'failed',
): Promise<JsonBackup> {
  return refreshAfterSnapshot(repo, before, before.commit, report, paths, status);
}

// A resolve can refresh a known-good after snapshot without changing its original before parent.
export async function refreshAfterSnapshot(
  repo: WorkTree,
  previous: BackupRecord,
  before: string,
  versions: { fromVersion: string | null; toVersion: string | null },
  paths: string[],
  status: 'complete' | 'failed' = 'complete',
): Promise<JsonBackup> {
  const fileModes = previous.metadata.fileModes && new Map(previous.metadata.fileModes);
  const tree = await snapshotTree(repo, previous.commit, paths, undefined, true, fileModes);
  const metadata: BackupMetadata = { ...previous.metadata, status, fileModes: fileModes && [...fileModes] };
  const commit = await saveSnapshot(repo, tree, before, metadata, versions);
  await git(repo.root, ['update-ref', previous.ref, commit, previous.commit]);
  return describeBackup({ ...previous, commit, metadata });
}

function blocked(backup: JsonBackup | null, reason: NonNullable<JsonUndoReport['blocked']>['reason'], message: string, paths: string[] = []): JsonUndoReport {
  return { schema: JSON_SCHEMA, backup, restorable: false, blocked: { reason, message, paths }, restored: false, files: 0 };
}

export interface UndoCheck {
  report: JsonUndoReport;
  restore?: { repo: WorkTree; record: BackupRecord; before: string; beforeModes: Map<string, number>; paths: string[]; matchesAfter: boolean };
}

function changedFileModes(from: Map<string, number>, to: Map<string, number>): string[] {
  return [...new Set([...from.keys(), ...to.keys()])].filter((path) => from.get(path) !== to.get(path));
}

export async function checkUndo(projectRoot: string, name?: string): Promise<UndoCheck> {
  const repo = await workTree(projectRoot);
  const record = repo && (await backupRecords(repo)).find(({ ref }) =>
    ref.startsWith(active) && (name === undefined || ref === `${active}${name}`));
  if (!repo || !record) {
    return { report: blocked(null, 'no-backup', name === undefined ? 'No backup was found for this project.' : `No backup named ${name} was found for this project.`) };
  }
  const backup = describeBackup(record);
  if (repo.head !== record.metadata.head) {
    return { report: blocked(backup, 'moved-head', "You've committed or switched commits since the upgrade. Undo only works before the upgrade is committed.") };
  }
  if (record.metadata.status === 'pending') {
    return { report: blocked(backup, 'pending', `The upgrade was interrupted. Your backup is at ${record.ref}. Ask for help restoring it by hand.`) };
  }
  const before = (await git(repo.root, ['rev-parse', `${record.commit}^`])).trim();
  const beforeMetadata = parseBackupMetadata(await git(repo.root, ['log', '-1', '--format=%B', before]));
  const beforeModes = new Map(beforeMetadata?.fileModes);
  const afterModes = new Map(record.metadata.fileModes);
  const compareModes = beforeMetadata?.fileModes !== undefined && record.metadata.fileModes !== undefined;
  const paths = [...new Set([
    ...await changedPaths(repo, record.commit, before),
    ...(compareModes ? changedFileModes(beforeModes, afterModes) : []),
  ])].sort();
  // Undo --check writes no refs, index entries, or objects to the project repository.
  const { changes, remaining, matchesAfter } = await withSnapshotIndex(async (directory) => {
    const objectsDirectory = (await git(repo.root, ['rev-parse', '--path-format=absolute', '--git-path', 'objects'])).replace(/\n$/, '');
    const objects = { GIT_OBJECT_DIRECTORY: directory, GIT_ALTERNATE_OBJECT_DIRECTORIES: JSON.stringify(objectsDirectory) };
    const currentModes = new Map<string, number>();
    const current = await snapshotTree(repo, record.commit, paths, objects, false, compareModes ? currentModes : undefined);
    const afterDifferences = [
      ...await changedPaths(repo, record.commit, current, objects),
      ...(compareModes ? changedFileModes(afterModes, currentModes) : []),
    ];
    // A partial undo can leave a mix of before and after entries, including missing files.
    const beforeDifferences = new Set(afterDifferences.length ? [
      ...await changedPaths(repo, before, current, objects),
      ...(compareModes ? changedFileModes(beforeModes, currentModes) : []),
    ] : paths);
    const changed = afterDifferences.filter((path) => beforeDifferences.has(path));
    if (record.metadata.index) {
      const index = await indexTree(repo, objects);
      if (index) changed.push(...await changedPaths(repo, record.metadata.index, index, objects));
      else changed.push(...await unmergedPaths(repo));
    }
    return {
      changes: [...new Set(changed)].sort(),
      remaining: paths.filter((path) => beforeDifferences.has(path)),
      matchesAfter: afterDifferences.length === 0,
    };
  });
  if (changes.length) {
    const message = `You have unsaved changes in ${changes.length} ${changes.length === 1 ? 'file' : 'files'} since the upgrade. Undo won't overwrite them. Commit them, stash them or discard them, then run undo again.`;
    return { report: blocked(backup, 'changes', message, changes) };
  }
  return {
    report: { schema: JSON_SCHEMA, backup, restorable: true, blocked: null, restored: false, files: remaining.length },
    restore: { repo, record, before, beforeModes, paths: remaining, matchesAfter },
  };
}

async function unmergedPaths(repo: WorkTree): Promise<string[]> {
  const entries = await git(repo.root, ['ls-files', '-u', '-z', '--', repo.prefix || '.']);
  return splitPaths(entries).map((entry) => entry.slice(entry.indexOf('\t') + 1 + repo.prefix.length));
}

export async function restoreBackup(projectRoot: string, restore: NonNullable<UndoCheck['restore']>): Promise<JsonBackup> {
  const { repo, record, before, beforeModes, paths } = restore;
  await assertReportPaths(projectRoot);
  const contents = new Map<string, { mode: string; blob: string }>();
  const entries = await git(repo.root, ['ls-tree', '-r', '-z', before, '--', repo.prefix || '.']);
  for (const entry of splitPaths(entries)) {
    const separator = entry.indexOf('\t');
    const [mode, kind, blob] = entry.slice(0, separator).split(' ');
    if (mode && kind === 'blob' && blob) contents.set(entry.slice(separator + 1 + repo.prefix.length), { mode, blob });
  }
  // Transitions do not stage changes. Checking the original index tree for this prefix
  // before restoring preserves staged bytes, while leaving index flags and siblings alone.
  for (const path of paths) {
    const absolute = resolveInside(projectRoot, path, 'Backup path');
    if (await hasSymbolicLink(projectRoot, absolute)) {
      throw new CliError(`Cannot restore a backup through a symbolic link: ${path}`);
    }
    const entry = contents.get(path);
    if (entry && entry.mode !== '100644' && entry.mode !== '100755') {
      throw new CliError(`Cannot restore this file type from the backup: ${path}`);
    }
    const stats = await lstat(absolute).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return null;
      throw error;
    });
    if (stats && !stats.isFile()) throw new CliError(`Cannot overwrite a non-file while restoring: ${path}`);
  }
  for (const path of paths) {
    const absolute = resolveInside(projectRoot, path, 'Backup path');
    const entry = contents.get(path);
    if (entry) {
      await mkdir(dirname(absolute), { recursive: true });
      const mode = beforeModes.get(path) ?? (entry.mode === '100755' ? 0o755 : 0o644);
      await restoreSnapshotBlob(repo, entry.blob, absolute, mode);
    } else {
      await unlink(absolute);
      await pruneEmptyDirectories(projectRoot, dirname(absolute));
    }
  }
  await removeReportFiles(projectRoot);
  const ref = `${undone}${describeBackup(record).name}`;
  await git(repo.root, ['update-ref', '--stdin'], undefined,
    `create ${ref} ${record.commit}\ndelete ${record.ref} ${record.commit}\n`);
  return describeBackup({ ...record, ref });
}
