import { styleText } from 'node:util';
import type { InitReport } from './commands/init';
import type { InspectReport } from './commands/inspect';
import type { KitModule } from './kit/modules';
import { transitionJson, type TransitionReport } from './transition/run';
import { missingNotes, suggestionLabel } from './transition/noteText';
import { fileCount, reportGroups } from './transition/savedReport';
import type { LineChanges, ResolveView } from './types/cli';
import { JSON_SCHEMA, type JsonDocument, type JsonUnsaved } from './types/json';

function color(style: 'green' | 'yellow' | 'magenta' | 'cyan', text: string): string {
  return process.stdout.isTTY && process.env.NO_COLOR === undefined ? styleText(style, text) : text;
}

function printPaths(lines: string[]): void {
  for (const line of lines.slice(0, 3)) console.log(`    ${line}`);
  if (lines.length > 3) console.log(`    … ${lines.length - 3} more`);
}

export function printUnsaved(unsaved: JsonUnsaved, force: boolean, backup: boolean): void {
  const { total, risky, touched, untouched } = unsaved;
  const affected = `${risky.length} unsaved ${risky.length === 1 ? 'file' : 'files'} can't be updated cleanly.`;
  if (force && risky.length) {
    console.log(`${color('yellow', '!')} ${affected} ${backup ? 'Taking a backup first (--no-backup to skip).' : 'Continuing without a backup.'}`);
    return;
  }
  const summary = `You have unsaved changes in ${total} ${total === 1 ? 'file' : 'files'}.`;
  if (risky.length === 0) {
    console.log(`${color('green', '✓')} ${summary} None of them are at risk${touched.length ? ` (${touched.length} update cleanly)` : ''}.`);
    return;
  }
  const conflicts = risky.filter(({ kind }) => kind === 'conflict').length;
  console.log(`${color('yellow', '▲')} ${summary}`);
  console.log(`    ${risky.length} can't be updated cleanly  risky`);
  console.log(`       ${conflicts} conflict with the kit · ${risky.length - conflicts} will keep your version`);
  console.log(`    ${touched.length} will be updated cleanly  safe`);
  console.log(`    ${untouched} won't be touched  safe`);
  console.log('  Files at risk');
  printPaths(risky.map(({ path, kind }) => `${path}  ${kind === 'keep-edited' ? 'kept' : kind}`));
}

function printNext(steps: string[]): void {
  if (steps.length === 0) return;
  console.log('Next:');
  for (const step of steps) console.log(`  ${step}`);
}

export function printInitReport(report: InitReport): void {
  console.log(`Created ${report.target}`);
  console.log(`Modules: ${report.modules.join(', ') || 'none (base only)'}`);
  console.log(`Git: ${report.git}`);
  const target = `'${report.target.replaceAll("'", "'\\''")}'`;
  printNext([`cd ${target}`, ...report.followUps, 'pnpm dev']);
}

export function printTransitionReport(report: TransitionReport, check: boolean): void {
  if (report.cancelled) {
    console.log('Cancelled.');
    return;
  }
  if (check) console.log('Preview — nothing was written.');
  if (check && !report.preview && report.unsaved?.total) printUnsaved(report.unsaved, false, false);
  if (report.backup) console.log(`${color('green', '✓')} Backup saved  ${report.backup.ref}`);
  if (report.applied) console.log(color('green', '✓') + ' ' + (report.upToDate === undefined ? 'Module change applied' : 'Upgrade applied'));
  if (!report.changes.length) console.log('Already up to date.');
  else {
    const { automatic, conflicts, kept, created } = reportGroups(report);
    console.log(`  ${color('green', '✓ Applied automatically')}   ${fileCount(automatic)}`);
    console.log(`  ${color('yellow', '⚠ Needs your decision')}      ${fileCount(conflicts.length)}`);
    console.log(`  ${color('magenta', '↷ Kept your version')}        ${fileCount(kept.length)}${kept.length ? '  you may be missing kit changes' : ''}`);
    console.log(`  ${color('cyan', '+ New files')}                ${created}`);
    if (kept.length) {
      console.log("  ↷ Kept your version — you'd changed these, the kit changed them too, yours won");
      printPaths(kept);
    }
    if (check && conflicts.length) {
      console.log('  Files needing your decision');
      printPaths(conflicts);
    }
  }
  for (const note of missingNotes(report.notes, report.changes, false)) console.log(`  ${note}`);
  if (report.suggestions.length) {
    console.log('  Suggestions');
    printPaths(report.suggestions.map(({ path, action, reason }) => `${path} — ${suggestionLabel(action)}. ${reason}`));
  }
  if (report.report) console.log(`  Report   ${report.report}`);
  if (report.applied && report.conflicts.length) {
    const next = report.conflicts.length === 1 ? 'go through the decision' : `go through the ${report.conflicts.length} decisions`;
    console.log(`  Next     nuxt-saas resolve   ${next}`);
  }
  if (report.backup) console.log('  Undo     nuxt-saas undo');
  printNext(report.followUps);
}

export function printJson(value: JsonDocument): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function printTransitionJson(report: TransitionReport, from: string, to: string): void {
  printJson(transitionJson(report, from, to));
}

export function printModulesJson(modules: KitModule[], installed: string[], commit: string): void {
  printJson({ schema: JSON_SCHEMA, commit, modules, installed });
}

export function printInspectJson(report: InspectReport): void {
  printJson({ schema: JSON_SCHEMA, ...report });
}

export function printInspect(report: InspectReport): void {
  const { summary } = report;
  console.log(
    `Kit ${report.commit.slice(0, 7)} · ${summary.total} files · ${summary.edited} edited · ${summary.deleted} deleted`,
  );
  const edited = report.files.filter((file) => file.status === 'edited');
  const deleted = report.files.filter((file) => file.status === 'deleted');
  if (edited.length > 0) {
    console.log('Edited:');
    for (const file of edited) console.log(`  ${file.path}`);
  }
  if (deleted.length > 0) {
    console.log('Deleted:');
    for (const file of deleted) console.log(`  ${file.path}`);
  }
  if (report.features.missing.length) {
    console.log('You may be missing:');
    for (const note of report.features.missing) console.log(`  ${note.title} (${note.module}): ${note.affected.join(', ')}`);
  }
  if (report.features.declined.length) {
    console.log(`Declined changes: ${report.features.declined.join(', ')}`);
  }
  if (report.conflicts.unresolved.length > 0) {
    console.log('Unresolved conflicts:');
    for (const path of report.conflicts.unresolved) console.log(`  ${path}`);
  }
}

export function printModules(modules: KitModule[], installed: string[]): void {
  for (const module of modules) {
    const tags = [
      installed.includes(module.id) ? 'installed' : '',
      module.internal ? 'internal' : '',
    ].filter(Boolean);
    console.log(
      `${module.id}${tags.length ? ` [${tags.join(', ')}]` : ''} — ${module.title}: ${module.description}`,
    );
  }
}

function describeLineChanges({ added, removed }: LineChanges): string {
  const parts = [];
  if (removed) parts.push(`removed ${removed} ${removed === 1 ? 'line' : 'lines'}`);
  if (added) parts.push(`added ${added} ${added === 1 ? 'line' : 'lines'}`);
  return parts.join(' · ') || 'no changed lines';
}

export function printResolveView({ decision, index, total, counts }: ResolveView): void {
  console.log(`\n[${index}/${total}] ${decision.path}   ${color('yellow', decision.kind)}`);
  for (const { title, module, kind } of decision.notes) console.log(`  Kit change   ${title}  ${module} · ${kind}`);
  if (counts) {
    console.log(`  You          ${describeLineChanges(counts.yours)}`);
    console.log(`  Kit          ${describeLineChanges(counts.kit)}`);
  }
  if (decision.suggestion) {
    const { action, reason } = decision.suggestion;
    const suggestion = action === 'take-kit' && decision.notes.some((note) => note.kind === 'security' && reason.includes(note.title))
      ? 'Take the kit version, then re-apply your edits' : suggestionLabel(action);
    console.log(`\n  ${color('cyan', 'Suggestion')}   ${suggestion}. ${reason}`);
  }
}
