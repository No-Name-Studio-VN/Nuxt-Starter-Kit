import { basename, join, resolve } from 'node:path';
import type { ParsedArgs } from 'citty';
import type {
  inspectArgs,
  listArgs,
  moduleChangeArgs,
  resolveArgs,
  upgradeArgs,
} from '../arguments';
import { CliError } from '../errors';
import { kitSource, targetCommit } from '../kit/context';
import { DEFAULT_TEMPLATE, openKit, resolveCommit } from '../kit/source';
import { readState, STATE_FILE } from '../project/state';
import { isInteractive, parseModules, promptInit, promptResolve, promptRisk } from '../prompts';
import {
  printInitReport,
  printJson,
  printResolveView,
  printInspect,
  printInspectJson,
  printModules,
  printModulesJson,
  printTransitionJson,
  printTransitionReport,
  printUnsaved,
} from '../report';
import type { SafetyOptions, TransitionReport } from '../transition/run';
import { JSON_SCHEMA, type JsonResolution } from '../types/json';
import type { InitOptions } from '../types/cli';
import { pathExists } from '../util/fs';
import { runInit } from './init';
import { runInspect } from './inspect';
import { runModuleChange } from './modules';
import { runResolve } from './resolve';
import { runUpgrade } from './upgrade';

function safetyOptions(
  args: ParsedArgs<typeof upgradeArgs> | ParsedArgs<typeof moduleChangeArgs>,
): Omit<SafetyOptions, 'projectRoot'> {
  const { check, force, backup, json } = args;
  const options: Omit<SafetyOptions, 'projectRoot'> = { check, force, backup };
  if (isInteractive(json)) options.confirmRisk = (unsaved) => promptRisk(unsaved, backup);
  if (!json)
    options.onUnsaved = (unsaved) => {
      if (force || options.confirmRisk || !unsaved.risky.length)
        printUnsaved(unsaved, force, backup);
    };
  return options;
}

function finishTransition(
  report: TransitionReport,
  from: string,
  to: string,
  json: boolean,
  check: boolean,
): number {
  if (json) printTransitionJson(report, from, to);
  else printTransitionReport(report, check || report.preview === true);
  return !report.cancelled && report.conflicts.length > 0 ? 3 : 0;
}

export async function initCommand(args: InitOptions): Promise<number> {
  const template = args.template ?? DEFAULT_TEMPLATE;
  const source = kitSource(args, template);
  const commit = await targetCommit(source, args.to, args['use-uncommitted-kit']);
  const kit = await openKit(source, commit, template);
  try {
    const selection = await promptInit(args, kit);
    if (!selection) {
      console.log('Cancelled.');
      return 0;
    }
    const target = resolve(selection.dir);
    const report = await runInit({
      target,
      identity: { name: basename(target), description: 'A Nuxt SaaS application' },
      requested: selection.requested,
      kit,
      git: args.git,
    });
    if (args.json) printJson({ schema: JSON_SCHEMA, ...report });
    else printInitReport(report);
    return 0;
  } finally {
    await kit.cleanup();
  }
}

export async function moduleCommand(
  args: ParsedArgs<typeof moduleChangeArgs>,
  action: 'add' | 'remove',
): Promise<number> {
  const projectRoot = resolve(args.dir);
  const state = await readState(projectRoot);
  const source = kitSource(args, state.kit);
  if (args['use-uncommitted-kit'])
    throw new CliError('Use upgrade --use-uncommitted-kit before changing modules.');
  if (source.kind === 'local') await resolveCommit(source);
  const kit = await openKit(source, state.commit, state.kit);
  try {
    const modules = parseModules(args.modules);
    const report = await runModuleChange({
      projectRoot,
      add: action === 'add' ? modules : [],
      remove: action === 'remove' ? modules : [],
      kit,
      ...safetyOptions(args),
    });
    return finishTransition(report, state.commit, kit.commit, args.json, args.check);
  } finally {
    await kit.cleanup();
  }
}

export async function upgradeCommand(args: ParsedArgs<typeof upgradeArgs>): Promise<number> {
  const projectRoot = resolve(args.dir);
  const state = await readState(projectRoot);
  const fromSource = kitSource(args, state.kit);
  const template = args.template ?? state.kit;
  const toSource = kitSource(args, template);
  const from = await openKit(fromSource, state.commit, state.kit);
  try {
    const commit = await targetCommit(toSource, args.to, args['use-uncommitted-kit'], from);
    const to = await openKit(toSource, commit, template);
    try {
      const report = await runUpgrade({
        projectRoot,
        from,
        to,
        ...safetyOptions(args),
      });
      return finishTransition(report, state.commit, commit, args.json, args.check);
    } finally {
      await to.cleanup();
    }
  } finally {
    await from.cleanup();
  }
}

export async function modulesCommand(args: ParsedArgs<typeof listArgs>): Promise<number> {
  const projectRoot = resolve(args.dir);
  const hasState =
    (await pathExists(join(projectRoot, STATE_FILE))) ||
    (await pathExists(join(projectRoot, '.nuxt-saas/manifest.json')));
  const state = hasState ? await readState(projectRoot) : null;
  if (state && args.to) throw new CliError('--to is only valid outside a project.');
  const template = state?.kit ?? args.template ?? DEFAULT_TEMPLATE;
  const source = kitSource(args, template);
  if (state && source.kind === 'local') await resolveCommit(source);
  if (state && args['use-uncommitted-kit'])
    throw new CliError(
      '--use-uncommitted-kit is only valid outside a project when listing modules.',
    );
  const commit =
    state?.commit ?? (await targetCommit(source, args.to, args['use-uncommitted-kit']));
  const kit = await openKit(source, commit, template);
  try {
    const installed = state?.modules ?? [];
    if (args.json) printModulesJson(kit.modules, installed, kit.commit, kit.groups);
    else printModules(kit.modules, installed, kit.groups);
    return 0;
  } finally {
    await kit.cleanup();
  }
}

export async function inspectCommand(args: ParsedArgs<typeof inspectArgs>): Promise<number> {
  const projectRoot = resolve(args.dir);
  const state = await readState(projectRoot);
  const source = kitSource(args, state.kit);
  if (source.kind === 'local') await resolveCommit(source);
  const kit = await openKit(source, state.commit, state.kit);
  try {
    const report = await runInspect({ projectRoot, kit, added: args.added });
    if (args.json) printInspectJson(report);
    else printInspect(report);
    return 0;
  } finally {
    await kit.cleanup();
  }
}

export async function resolveCommand(args: ParsedArgs<typeof resolveArgs>): Promise<number> {
  const actions: JsonResolution['action'][] = ['keep-mine', 'take-kit', 'combine'];
  const selected = actions.filter((action) => args[action]);
  if (selected.length > 1)
    throw new CliError('Choose only one of --keep-mine, --take-kit, or --combine.');
  const [action] = selected;
  if (!args.json && args.file && !action)
    throw new CliError('Choose --keep-mine, --take-kit, or --combine for this file.');
  if (args.file && args.all) throw new CliError('--all is only for the walkthrough.');
  const interactive = isInteractive(args.json) && !args.file && !action;
  const { cancelled, ...report } = await runResolve({
    projectRoot: resolve(args.dir),
    ...(args.file ? { path: args.file } : {}),
    ...(action ? { action } : {}),
    decline: args.decline,
    all: args.all,
    ...(interactive
      ? {
          walkthrough: {
            show: printResolveView,
            choose: promptResolve,
            showSides: console.log,
            showError: (message) => console.error(`  ${message}`),
          },
        }
      : {}),
  });
  const pending = report.decisions.filter((decision) => decision.pending);
  if (args.json) printJson(report);
  else if (cancelled) console.log('Cancelled.');
  else {
    if (report.resolved) console.log(`Resolved ${report.resolved.path}.`);
    if (!interactive && !report.resolved) {
      for (const decision of pending) {
        if (decision.kind === 'conflict' || args.all)
          console.log(`  ${decision.path}  ${decision.kind}`);
      }
    }
    const conflicts = pending.filter(({ kind }) => kind === 'conflict').length;
    const kept = pending.length - conflicts;
    if (conflicts)
      console.log(`${conflicts} ${conflicts === 1 ? 'conflict remains' : 'conflicts remain'}.`);
    if (kept)
      console.log(
        `${kept} ${kept === 1 ? 'kept file' : 'kept files'} to review with nuxt-saas resolve --all.`,
      );
    if (!pending.length) console.log('No pending decisions.');
  }
  return !cancelled && pending.some(({ kind }) => kind === 'conflict') ? 3 : 0;
}
