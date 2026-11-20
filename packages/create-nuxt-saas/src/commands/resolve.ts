import { CliError } from '../errors';
import { countLineChanges } from '../git/lineChanges';
import { noteFileSchema } from '../kit/notes';
import { checkUndo, refreshAfterSnapshot } from '../project/backup';
import { readState, STATE_FILE, updateDeclined, writeState } from '../project/state';
import { applyPlan } from '../transition/apply';
import { hasConflictMarkers, parseConflict } from '../transition/conflictMarkers';
import { normalized, readUserFile } from '../transition/plan';
import { isProtected } from '../transition/protected';
import { hasKitCopy, readKitCopy, readSavedReport, writeSavedReport } from '../transition/savedReport';
import type { ResolveOptions, ResolveView } from '../types/cli';
import { JSON_SCHEMA, type JsonDecision, type JsonDecisionsReport, type JsonResolution } from '../types/json';
import { resolveInside } from '../util/paths';

function decisionPath(projectRoot: string, path: string): string {
  const parts = path.toLowerCase().split('/');
  if (!noteFileSchema.safeParse(path).success || isProtected(path) ||
    parts.includes('.git') || parts[0] === '.nuxt-saas' || parts[0] === STATE_FILE) {
    throw new CliError(`Cannot resolve ${path}: not a project decision file.`);
  }
  return resolveInside(projectRoot, path, 'Decision path');
}

async function loadDecisions(projectRoot: string) {
  const state = await readState(projectRoot);
  const saved = await readSavedReport(projectRoot);
  const report = saved?.to === state.commit ? saved : null;
  const kinds = new Map<string, JsonDecision['kind']>();
  for (const { path, kind } of report?.changes ?? []) {
    if (kind === 'conflict' || kind === 'keep-edited') kinds.set(path, kind);
  }
  for (const path of state.conflicts) kinds.set(path, 'conflict');

  const decisions: JsonDecision[] = [];
  for (const [path, kind] of kinds) {
    if (isProtected(path)) continue;
    const absolute = decisionPath(projectRoot, path);
    const resolution = report?.resolutions.findLast((entry) => entry.path === path)?.action ?? null;
    const file = kind === 'conflict' ? await readUserFile(projectRoot, absolute) : null;
    const pending = kind === 'keep-edited' ? !resolution : file === 'owned' || Boolean(file && hasConflictMarkers(normalized(file.content)));
    const notes = (report?.notes ?? []).filter((note) => note.files.includes(path))
      .map(({ id, module, title, kind, since, files }) => ({ id, module, title, kind, since, files }));
    decisions.push({
      path, kind, pending, resolution, notes,
      suggestion: report?.suggestions.find((suggestion) => suggestion.path === path) ?? null,
      hasKitVersion: Boolean(report && await hasKitCopy(projectRoot, path)),
    });
  }
  return { state, report, decisions };
}

async function resolveFile(projectRoot: string, path: string, action: JsonResolution['action'], decline: boolean) {
  const { state, report, decisions } = await loadDecisions(projectRoot);
  const decision = decisions.find((entry) => entry.path === path);
  if (!decision) throw new CliError(`${path} is not in the upgrade decisions.`);
  if (!decision.pending) throw new CliError(`${path} is already resolved.`);
  if (decline && action !== 'keep-mine') throw new CliError('--decline requires --keep-mine.');
  const absolute = decisionPath(projectRoot, path);
  let content: Buffer | undefined;
  if (decision.kind === 'keep-edited') {
    if (action === 'combine') throw new CliError(`There's nothing to combine in ${path}; keep your version or take the kit version.`);
    if (action === 'take-kit') {
      const kit = report && await readKitCopy(projectRoot, path);
      if (!kit) throw new CliError(`No saved kit version is available for ${path}.`);
      content = kit;
    }
  }
  const restore = report?.backup || !report
    ? (await checkUndo(projectRoot, report?.backup?.name)).restore
    : undefined;
  if (decision.kind === 'conflict') {
    const file = await readUserFile(projectRoot, absolute);
    if (file === 'owned' || file?.binary) throw new CliError(`Cannot resolve ${path}: not a regular text file.`);
    if (!file) throw new CliError(`${path} is already resolved.`);
    content = Buffer.from(parseConflict(file.content.toString('utf8'), path).resolve(action));
  }
  if (content !== undefined) {
    if (await readUserFile(projectRoot, absolute) === 'owned') throw new CliError(`Cannot replace ${path}: not a regular file.`);
    await applyPlan(projectRoot, { changes: [{ path, kind: 'update', content }] });
  }
  const conflicts = state.conflicts.filter((entry) => entry !== path);
  const declined = decline ? updateDeclined(state.declined, decision.notes.map(({ id }) => id), false) : state.declined;
  if (conflicts.length !== state.conflicts.length || declined.join(',') !== state.declined.join(',')) {
    await writeState(projectRoot, { ...state, conflicts, declined });
  }
  if (restore?.matchesAfter) {
    const backup = await refreshAfterSnapshot(restore.repo, restore.record, restore.before,
      report ?? { fromVersion: null, toVersion: null }, [STATE_FILE, path]);
    if (report) report.backup = backup;
  }
  if (report) {
    report.resolutions.push({ path, action, at: new Date().toISOString() });
    await writeSavedReport(projectRoot, report);
  }
  return { path, action };
}

async function reviewDecision(projectRoot: string, decision: JsonDecision) {
  const { path, kind } = decision;
  const file = await readUserFile(projectRoot, decisionPath(projectRoot, path));
  const yours = file && file !== 'owned' && !file.binary ? file.content.toString('utf8') : null;
  if (kind === 'conflict' && yours !== null) {
    try {
      const { hunks } = parseConflict(yours, path);
      const text = (side: 'base' | 'yours' | 'kit') => hunks.map((hunk) => hunk[side]).join('');
      const counts = await countLineChanges(text('base').replaceAll('\r\n', '\n'), text('yours').replaceAll('\r\n', '\n'), text('kit').replaceAll('\r\n', '\n'));
      const sides = hunks.map((hunk, i) => `Hunk ${i + 1}\nYou\n${hunk.yours}Kit\n${hunk.kit}`).join('\n');
      return { counts, sides };
    } catch (error) {
      if (error instanceof CliError) return { counts: null, sides: error.message };
      throw error;
    }
  }
  const kit = decision.hasKitVersion ? await readKitCopy(projectRoot, path) : null;
  return { counts: null, sides: `You\n${yours ?? '(No text version available)'}\nKit\n${kit && !kit.includes(0) ? kit.toString('utf8') : '(No text version available)'}` };
}

export async function runResolve(opts: ResolveOptions): Promise<JsonDecisionsReport & { cancelled: boolean }> {
  const { projectRoot, path, action, decline = false, walkthrough } = opts;
  if (action && !path) throw new CliError('Provide a file to resolve.');
  if (path && isProtected(path)) throw new CliError(`Cannot resolve ${path}: this protected file belongs to your project.`);
  if (decline && action !== 'keep-mine') throw new CliError('--decline requires --keep-mine.');
  let cancelled = false;
  let resolved: Pick<JsonResolution, 'path' | 'action'> | undefined;
  if (path && action) resolved = await resolveFile(projectRoot, path, action, decline);
  if (!path && !action && walkthrough) {
    const { decisions } = await loadDecisions(projectRoot);
    const pending = decisions.filter((decision) => decision.pending && (opts.all || decision.kind === 'conflict'));
    for (const [index, decision] of pending.entries()) {
      const { counts, sides } = await reviewDecision(projectRoot, decision);
      const view: ResolveView = { decision, index: index + 1, total: pending.length, counts };
      walkthrough.show(view);
      let choice = await walkthrough.choose(view);
      while (choice === 'show') {
        walkthrough.showSides(sides);
        choice = await walkthrough.choose(view);
      }
      if (choice === 'cancel') { cancelled = true; break; }
      if (choice === 'quit') break;
      if (choice === 'skip') continue;
      try {
        await resolveFile(projectRoot, decision.path, choice === 'decline' ? 'keep-mine' : choice, choice === 'decline');
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        walkthrough.showError(error.message);
      }
    }
  }
  const { decisions } = await loadDecisions(projectRoot);
  return { schema: JSON_SCHEMA, ...(resolved ? { resolved } : {}), decisions, cancelled };
}
