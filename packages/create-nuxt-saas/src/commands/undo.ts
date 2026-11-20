import { resolve } from 'node:path';
import { CliError } from '../errors';
import { checkUndo, listBackups, restoreBackup } from '../project/backup';
import { isInteractive, promptUndo } from '../prompts';
import { printJson } from '../report';
import { fileCount } from '../transition/savedReport';
import type { UndoOptions } from '../types/cli';
import { JSON_SCHEMA } from '../types/json';

export async function undoCommand(args: UndoOptions): Promise<number> {
  const projectRoot = resolve(args.dir);
  if (args.list) {
    const backups = await listBackups(projectRoot);
    if (args.json) printJson({ schema: JSON_SCHEMA, backups });
    else if (!backups.length) console.log('No backups found for this project.');
    else for (const backup of backups) console.log(`${backup.name}  ${backup.status}  expires ${backup.expiresAt}`);
    return 0;
  }
  let { report, restore } = await checkUndo(projectRoot, args.backup);
  if (args.check && args.json) {
    printJson(report);
    return 0;
  }
  if (!restore) throw new CliError(blockedMessage(report));
  if (args.check) {
    console.log(`Preview — nothing was written. Undo would restore ${fileCount(report.files)}.`);
    return 0;
  }
  if (!args.yes) {
    if (!isInteractive(args.json)) throw new CliError('Use --yes to restore a backup without a prompt, or --check to preview.');
    const backup = report.backup;
    if (!backup) throw new CliError('No backup was found for this project.');
    const choice = await promptUndo(projectRoot, backup, restore.paths);
    if (choice !== 'continue') {
      console.log(choice === 'preview' ? 'Preview — nothing was written.' : 'Cancelled.');
      return 0;
    }
    // The confirmation may have been left open while the project changed.
    ({ report, restore } = await checkUndo(projectRoot, backup.name));
    if (!restore) throw new CliError(blockedMessage(report));
  }
  const backup = await restoreBackup(projectRoot, restore);
  if (args.json) printJson({ ...report, backup, restored: true });
  else {
    console.log(`✓ Restored ${fileCount(report.files)}.`);
    console.log('  Backups are kept for 14 days · see them with nuxt-saas undo --list');
  }
  return 0;
}

function blockedMessage({ blocked }: Awaited<ReturnType<typeof checkUndo>>['report']): string {
  if (!blocked) return 'This backup cannot be restored.';
  return [blocked.message, ...blocked.paths.map((path) => `  ${path}`)].join('\n');
}
