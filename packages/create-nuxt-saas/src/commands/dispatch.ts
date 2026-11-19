import { basename, join, resolve } from 'node:path';
import type { ParsedArgs } from 'citty';
import type { inspectArgs, listArgs, moduleChangeArgs, upgradeArgs } from '../arguments';
import { CliError } from '../errors';
import { kitSource, targetCommit } from '../kit/context';
import { DEFAULT_TEMPLATE, openKit, resolveCommit } from '../kit/source';
import { readState, STATE_FILE } from '../project/state';
import { parseModules, promptInit } from '../prompts';
import {
  printInitReport,
  printInspect,
  printInspectJson,
  printModules,
  printModulesJson,
  printTransitionJson,
  printTransitionReport,
} from '../report';
import type { InitOptions } from '../types/cli';
import { pathExists } from '../util/fs';
import { runInit } from './init';
import { runInspect } from './inspect';
import { runModuleChange } from './modules';
import { runUpgrade } from './upgrade';

export async function initCommand(args: InitOptions): Promise<number> {
  const template = args.template ?? DEFAULT_TEMPLATE;
  const source = kitSource(args, template);
  const kit = await openKit(source, await resolveCommit(source), template);
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
    printInitReport(report);
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
  if (source.kind === 'local') await resolveCommit(source);
  const kit = await openKit(source, state.commit, state.kit);
  try {
    const modules = parseModules(args.modules);
    const report = await runModuleChange({
      projectRoot,
      add: action === 'add' ? modules : [],
      remove: action === 'remove' ? modules : [],
      kit,
      check: args.check,
      force: args.force,
    });
    if (args.json) printTransitionJson(report, state.commit, kit.commit);
    else printTransitionReport(report, args.check);
    return report.conflicts.length > 0 ? 1 : 0;
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
  const commit = await targetCommit(toSource, args.to);
  const from = await openKit(fromSource, state.commit, state.kit);
  try {
    const to = await openKit(toSource, commit, template);
    try {
      const report = await runUpgrade({
        projectRoot,
        from,
        to,
        check: args.check,
        force: args.force,
      });
      if (args.json) printTransitionJson(report, state.commit, commit);
      else printTransitionReport(report, args.check);
      return report.conflicts.length > 0 ? 1 : 0;
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
  const commit = state?.commit ?? (await targetCommit(source, args.to));
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
    const report = await runInspect({ projectRoot, kit });
    if (args.json) printInspectJson(report);
    else printInspect(report);
    return 0;
  } finally {
    await kit.cleanup();
  }
}
