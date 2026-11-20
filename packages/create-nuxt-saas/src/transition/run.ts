import { CliError } from '../errors';
import { workTree } from '../git/snapshot';
import { readKitConfig } from '../kit/config';
import { collectNotes } from '../kit/notes';
import type { KitSnapshot } from '../kit/source';
import { beginBackup, finishBackup, pruneBackups } from '../project/backup';
import { STATE_FILE, writeState, type ProjectState } from '../project/state';
import { assessUnsaved } from '../project/unsaved';
import type { Tree } from '../render/render';
import { JSON_SCHEMA, type JsonBackup, type JsonSavedReport, type JsonTransitionReport, type JsonUnsaved } from '../types/json';
import { cleanupOnTermination } from '../util/terminationCleanup';
import { applyPlan } from './apply';
import { followUpsFor } from './followUps';
import { suggest, transitionNotes } from './notes';
import type { TransitionPlan } from './plan';
import { assertReportPaths, readKitVersion, REPORT_PATH, writeSavedReport } from './savedReport';

export type RiskChoice = 'continue' | 'preview' | 'cancel';

export interface SafetyOptions {
  projectRoot: string;
  check: boolean;
  force: boolean;
  backup?: boolean;
  confirmRisk?: (unsaved: JsonUnsaved) => Promise<RiskChoice>;
  onUnsaved?: (unsaved: JsonUnsaved) => void;
}

export interface TransitionReport extends Omit<JsonTransitionReport, 'schema' | 'from' | 'to' | 'changes'> {
  changes: TransitionPlan['changes'];
  cancelled?: boolean;
  preview?: boolean;
}

export function transitionJson(report: TransitionReport, from: string, to: string): JsonTransitionReport {
  const { cancelled: _, preview: _preview, changes, ...rest } = report;
  return { schema: JSON_SCHEMA, from, to, ...rest, changes: changes.map(({ path, kind }) => ({ path, kind })) };
}

export async function runTransition(
  opts: SafetyOptions,
  command: JsonSavedReport['command'],
  from: KitSnapshot,
  to: KitSnapshot,
  base: Tree,
  target: Tree,
  plan: TransitionPlan,
  state: ProjectState,
  next: ProjectState,
  upToDate?: boolean,
): Promise<TransitionReport> {
  const { projectRoot, check, force, backup = true } = opts;
  const repo = await workTree(projectRoot);
  const unsaved = await assessUnsaved(projectRoot, plan.changes, repo);
  const conflicts = plan.changes.filter(({ kind }) => kind === 'conflict').map(({ path }) => path);
  const [fromVersion, toVersion, config] = await Promise.all([
    readKitVersion(from.dir), readKitVersion(to.dir), readKitConfig(to.dir),
  ]);
  const notes = transitionNotes(
    collectNotes(config.changes, to.modules, [...state.modules, ...next.modules]),
    plan.changes, state.declined ?? [], fromVersion, toVersion,
  );
  const suggestions = [];
  for (const path of conflicts) suggestions.push(await suggest(projectRoot, path, base, target, notes));
  const report: TransitionReport = {
    changes: plan.changes,
    conflicts,
    followUps: followUpsFor(base, target, plan.changes, next.modules),
    addedModules: next.modules.filter((id) => !state.modules.includes(id)),
    removedModules: state.modules.filter((id) => !next.modules.includes(id)).sort(),
    applied: false,
    ...(upToDate === undefined ? {} : { upToDate }),
    unsaved,
    backup: null,
    report: null,
    notes,
    suggestions,
  };
  if (check || upToDate) return report;
  if (!repo) {
    if (!force) throw new CliError("This project isn't in git, so nothing could be undone. Run git init and commit, or use --force --no-backup.");
    if (backup) throw new CliError("This project isn't in git, so nothing could be backed up. Use --force --no-backup to continue.");
  }
  if (unsaved?.total) opts.onUnsaved?.(unsaved);
  if (unsaved?.risky.length && !force) {
    if (!opts.confirmRisk) {
      const count = unsaved.risky.length;
      const paths = unsaved.risky.slice(0, 3).map(({ path }) => path).join(', ');
      const hint = backup ? '--force to proceed (a backup is taken first)' : '--force to proceed without a backup';
      throw new CliError(`${count} unsaved ${count === 1 ? 'file' : 'files'} can't be updated cleanly: ${paths}${count > 3 ? ', …' : ''}. Use ${hint}, or --check to preview.`);
    }
    const decision = await opts.confirmRisk(unsaved);
    if (decision === 'cancel') return { ...report, cancelled: true };
    if (decision === 'preview') return { ...report, preview: true };
  }
  if (state.kit === next.kit && state.commit === next.commit && !report.addedModules.length &&
    !report.removedModules.length && !plan.changes.length && !state.conflicts.length) return report;
  await assertReportPaths(projectRoot);

  const saved: JsonSavedReport = {
    ...transitionJson(report, from.commit, to.commit),
    command,
    createdAt: new Date().toISOString(),
    fromVersion,
    toVersion,
    resolutions: [],
    report: REPORT_PATH,
    applied: true,
  };
  const paths = [
    STATE_FILE,
    ...plan.changes.filter(({ kind }) => kind !== 'keep-protected').map(({ path }) => path),
  ];
  const before = repo && backup ? await beginBackup(repo, saved, paths) : null;
  const interrupt = new AbortController();
  const applying = (async (): Promise<JsonBackup | null> => {
    try {
      await applyPlan(projectRoot, plan, interrupt.signal);
      interrupt.signal.throwIfAborted();
      await writeState(projectRoot, { ...next, conflicts });
      interrupt.signal.throwIfAborted();
    } catch (error) {
      if (!repo || !before) throw error;
      const message = error instanceof Error ? error.message : String(error);
      try {
        await finishBackup(repo, before, saved, paths, 'failed');
      } catch {
        throw new CliError(`${message}\nYour backup is at ${before.ref}. Ask for help restoring it by hand.`);
      }
      if (!interrupt.signal.aborted) await pruneBackups(repo);
      throw new CliError(`${message}\nThe project was backed up. Run nuxt-saas undo to put it back.`);
    }
    if (!repo || !before) return null;
    try {
      return await finishBackup(repo, before, saved, paths, 'complete');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CliError(`${message}\nYour backup is at ${before.ref}. Ask for help restoring it by hand.`);
    }
  })();
  const unregister = repo && before ? cleanupOnTermination(async () => {
    // Stop before the next write; the shared apply task snapshots after the in-flight write settles.
    interrupt.abort(new CliError('The project update was interrupted.'));
    await applying;
  }, { beforeOtherCleanups: true }) : undefined;
  saved.backup = await applying.finally(unregister);
  interrupt.signal.throwIfAborted();
  if (repo && before) await pruneBackups(repo);

  try {
    await writeSavedReport(projectRoot, saved, target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: The project update was applied, but its report could not be saved: ${message}`);
    saved.report = null;
  }
  return { ...report, applied: true, backup: saved.backup, report: saved.report };
}
