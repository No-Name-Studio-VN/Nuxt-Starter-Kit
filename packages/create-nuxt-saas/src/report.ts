import type { InitReport } from './commands/init';
import type { TransitionReport } from './commands/modules';
import type { KitModule } from './kit/modules';
import type { ChangeKind } from './transition/plan';

const symbols: Record<ChangeKind, string> = {
  create: '+',
  update: '~',
  merge: 'M',
  conflict: '!',
  delete: '-',
  'keep-edited': '=',
  'keep-protected': '=',
};

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
  if (check) console.log('Preview — nothing was written.');
  for (const change of report.changes) {
    console.log(`${symbols[change.kind]} ${change.kind.padEnd(14)} ${change.path}`);
  }
  if (report.changes.length === 0) console.log('Already up to date.');
  if (report.conflicts.length > 0) {
    console.log('Conflicts:');
    for (const path of report.conflicts) console.log(`  ${path}`);
  }
  printNext(report.followUps);
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
