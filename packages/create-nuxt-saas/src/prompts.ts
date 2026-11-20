import { basename } from 'node:path';
import { isCancel, multiselect, select, text } from '@clack/prompts';
import type { KitModule } from './kit/modules';
import { suggestionLabel } from './transition/noteText';
import type { RiskChoice } from './transition/run';
import type { JsonBackup, JsonUnsaved } from './types/json';
import type { InitOptions, ResolveChoice, ResolveView } from './types/cli';
import { DEFAULT_PROJECT_NAME, validateProjectName } from './util/projectName';

export function parseModules(value: string): string[] {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function promptInit(args: InitOptions, modules: KitModule[]) {
  let dir = args.dir;
  if (!dir) {
    if (args.yes) dir = DEFAULT_PROJECT_NAME;
    else {
      const name = await text({
        message: 'Project name?',
        initialValue: DEFAULT_PROJECT_NAME,
        validate: (value) => validateProjectName(value ?? '') ?? undefined,
      });
      if (isCancel(name)) return null;
      dir = name;
    }
  }
  let requested = args.modules === undefined ? [] : parseModules(args.modules);
  if (args.modules === undefined && !args.yes && process.stdin.isTTY) {
    const selected = await multiselect({
      message: 'Which modules would you like?',
      required: false,
      options: modules
        .filter((module) => !module.internal)
        .map((module) => ({
          value: module.id,
          label: module.title,
          hint: module.description,
        })),
    });
    if (isCancel(selected)) return null;
    requested = selected;
  }
  return { dir, requested };
}

export function isInteractive(json: boolean): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !json);
}

export async function promptRisk(unsaved: JsonUnsaved, backup: boolean): Promise<RiskChoice> {
  const count = unsaved.risky.length;
  const choice = await select<RiskChoice>({
    message: `${count} ${count === 1 ? "file you're" : "files you're"} still working on can't be updated cleanly. What do you want to do?`,
    options: [
      { value: 'continue', label: backup ? 'Back up and continue (recommended)' : 'Continue without a backup' },
      { value: 'preview', label: 'Preview only (nothing changes)' },
      { value: 'cancel', label: 'Cancel' },
    ],
  });
  return isCancel(choice) ? 'cancel' : choice;
}

export async function promptUndo(projectRoot: string, backup: JsonBackup, paths: string[]): Promise<RiskChoice> {
  const time = new Date(backup.createdAt);
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(time);
  const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(time);
  const choice = await select<RiskChoice>({
    message: `Put ${basename(projectRoot)} back to how it was on ${date} at ${clock}?`,
    options: [
      { value: 'continue', label: 'Yes, restore the backup' },
      { value: 'preview', label: 'Show what would change' },
      { value: 'cancel', label: 'Cancel' },
    ],
  });
  if (choice === 'preview') for (const path of paths) console.log(`  ${path}`);
  return isCancel(choice) ? 'cancel' : choice;
}

export async function promptResolve({ decision }: ResolveView): Promise<ResolveChoice> {
  const choices: { value: ResolveChoice; label: string; hint?: string }[] = [];
  const suggested = decision.suggestion?.action;
  if (suggested && suggested !== 'by-hand') choices.push({ value: suggested, label: suggestionLabel(suggested), hint: 'suggested' });
  if (suggested !== 'keep-mine') choices.push({ value: 'keep-mine', label: 'Keep mine' });
  if (suggested !== 'take-kit' && (decision.kind === 'conflict' || decision.hasKitVersion)) {
    choices.push({ value: 'take-kit', label: 'Take the kit version' });
  }
  if (suggested !== 'combine' && decision.kind === 'conflict') choices.push({ value: 'combine', label: 'Combine' });
  choices.push({ value: 'show', label: 'Show both sides' });
  if (decision.notes.length) choices.push({ value: 'decline', label: "I don't want this feature (don't ask again)" });
  choices.push({ value: 'skip', label: 'Skip' }, { value: 'quit', label: 'Quit' });
  const choice = await select<ResolveChoice>({ message: 'What do you want to do with this file?', options: choices });
  return isCancel(choice) ? 'cancel' : choice;
}
