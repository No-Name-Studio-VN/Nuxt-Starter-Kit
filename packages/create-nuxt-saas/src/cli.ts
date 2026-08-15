import { basename, relative, resolve } from 'node:path';
import { intro, isCancel, log, multiselect, note, outro, text } from '@clack/prompts';
import { defineCommand, runCommand, showUsage } from 'citty';
import type { ChangeReport } from './commands/add';
import { runAdd } from './commands/add';
import { runDiff } from './commands/diff';
import { runInit } from './commands/init';
import { runRemove } from './commands/remove';
import { runStatus } from './commands/status';
import { runUpgrade } from './commands/upgrade';
import { CliError } from './errors';
import { loadRegistry } from './registry/load';
import { pickableModules, type Registry } from './registry/schema';
import type { Placeholders } from './render/placeholders';
import {
  assertProjectName,
  DEFAULT_PROJECT_NAME,
  sanitizeProjectName,
  validateProjectName,
} from './util/projectName';

function cancelled(): never {
  throw new CliError('Cancelled.');
}

async function promptModules(registry: Registry): Promise<string[]> {
  const alwaysOn = registry.modules
    .filter((module) => module.required)
    .map((module) => module.title);

  const selection = await multiselect({
    message:
      alwaysOn.length > 0
        ? `${alwaysOn.join(' and ')} ${alwaysOn.length > 1 ? 'are' : 'is'} always included. Add modules:`
        : 'Which modules do you want?',
    options: pickableModules(registry).map((module) => ({
      value: module.id,
      label: module.title,
      hint: module.description,
    })),
    // Picking nothing is a real answer once a required module carries the
    // project on its own.
    required: alwaysOn.length === 0,
  });
  if (isCancel(selection)) cancelled();
  return selection;
}

async function promptProjectName(): Promise<string> {
  const projectName = await text({
    message: 'Project name',
    defaultValue: DEFAULT_PROJECT_NAME,
    placeholder: DEFAULT_PROJECT_NAME,
    // An empty submission takes defaultValue, so only a typed name is checked.
    validate: (value) => {
      const typed = value ?? '';
      return typed.length === 0 ? undefined : (validateProjectName(typed) ?? undefined);
    },
  });
  if (isCancel(projectName)) cancelled();
  return projectName;
}

async function promptDescription(): Promise<string> {
  const description = await text({
    message: 'Description',
    defaultValue: '',
    placeholder: 'A Nuxt application',
  });
  if (isCancel(description)) cancelled();
  return description;
}

interface InitTarget {
  /** Where the project is written, as given on the command line. */
  dir: string;
  /** What lands in package.json's `name`. */
  name: string;
}

/**
 * Settles where the project goes and what it is called.
 *
 * With no directory argument the name is asked for first and becomes the folder,
 * which is the flow every `create-*` scaffolder uses and the reason `dir` has no
 * default: falling back to the working directory is what made a bare invocation
 * fail against a non-empty cwd.
 *
 * A directory argument keeps its own spelling and the name is derived from it.
 * That name is sanitized rather than validated because the user is not being
 * asked anything — `init ./MyApp` should scaffold, not lecture — whereas a typed
 * name is validated strictly, since the prompt can re-ask on the spot.
 */
export async function resolveInitTarget(
  dir: string | undefined,
  interactive: boolean,
): Promise<InitTarget> {
  if (dir === undefined || dir.length === 0) {
    const name = interactive ? await promptProjectName() : DEFAULT_PROJECT_NAME;
    assertProjectName(name);
    return { dir: name, name };
  }
  return { dir, name: sanitizeProjectName(basename(resolve(dir))) };
}

/**
 * Shell-safe form of a path, quoted only when it needs to be.
 *
 * A directory argument is echoed back verbatim, so `init "./my app"` would
 * otherwise suggest `cd ./my app` — two arguments to `cd`, and a command the
 * user cannot paste. Single quotes with the `'\''` escape, as
 * `lint-staged.config.js` does for the same reason.
 */
function quoteForShell(path: string): string {
  return /^[\w./@:-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;
}

/** The commands a freshly generated project needs, in order. */
export function nextSteps(projectRoot: string): string[] {
  const location = relative(process.cwd(), projectRoot);
  return [
    ...(location.length > 0 ? [`cd ${quoteForShell(location)}`] : []),
    'npm install',
    'npm run dev',
  ];
}

const initCommand = defineCommand({
  meta: { name: 'init', description: 'Create a new project from the starter kit.' },
  args: {
    dir: {
      type: 'positional',
      required: false,
      description: 'Target directory (defaults to a new folder named after the project)',
    },
    modules: { type: 'string', description: 'Comma-separated module ids (skips the picker)' },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
    kit: { type: 'string', description: 'Path to a local kit checkout instead of downloading' },
    yes: { type: 'boolean', description: 'Skip prompts and use defaults', default: false },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const interactive = !args.yes && process.stdout.isTTY === true;
    if (interactive) intro('Nuxt Starter Kit');

    const target = await resolveInitTarget(args.dir, interactive);
    const placeholders: Placeholders = {
      PROJECT_NAME: target.name,
      PROJECT_DESCRIPTION: interactive ? await promptDescription() : '',
    };

    const moduleIds = args.modules
      ? args.modules
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : interactive
        ? await promptModules(registry)
        : registry.modules.map((module) => module.id);

    const result = await runInit({
      registry,
      targetDir: target.dir,
      moduleIds,
      placeholders,
      ...(args.kit ? { localKitRoot: args.kit } : {}),
    });

    const summary = `Created ${result.projectRoot} with ${result.moduleIds.join(', ')} (${result.fileCount} files).`;
    const steps = nextSteps(result.projectRoot);

    if (interactive) {
      for (const message of result.notes) log.info(message);
      if (result.env.length > 0) {
        log.warn(`Set these environment variables: ${result.env.join(', ')}`);
      }
      note(steps.join('\n'), 'Next steps');
      outro(summary);
      return;
    }

    console.log(summary);
    for (const message of result.notes) console.log(`note: ${message}`);
    if (result.env.length > 0) {
      console.log(`Set these environment variables: ${result.env.join(', ')}`);
    }
    console.log(steps.join('\n'));
  },
});

const modulesCommand = defineCommand({
  meta: { name: 'modules', description: 'List modules in the registry.' },
  args: { registry: { type: 'string', description: 'Path to an alternative registry.json' } },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    for (const module of registry.modules) {
      const requires =
        module.requires.length > 0 ? ` (requires ${module.requires.join(', ')})` : '';
      // This command inspects the registry rather than offering a choice, so
      // the modules the picker hides still belong in the listing — labelled.
      const flag = module.required ? ' [always installed]' : module.internal ? ' [internal]' : '';
      console.log(`${module.id}@${module.version}${flag}${requires} — ${module.description}`);
    }
  },
});

const upgradeCommand = defineCommand({
  meta: { name: 'upgrade', description: 'Pull upstream kit changes into this project.' },
  args: {
    dir: { type: 'string', description: 'Project directory', default: '.' },
    check: { type: 'boolean', description: 'Preview without writing', default: false },
    force: { type: 'boolean', description: 'Allow a dirty working tree', default: false },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
    kit: { type: 'string', description: 'Local checkout of the target revision' },
    'base-kit': { type: 'string', description: 'Local checkout of the current revision' },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const report = await runUpgrade({
      projectRoot: args.dir,
      registry,
      check: args.check,
      force: args.force,
      resolveLocalKit: (revision) =>
        (revision === registry.kit.revision ? args.kit : args['base-kit']) || undefined,
    });

    if (report.upToDate) {
      console.log('Already up to date.');
      return;
    }

    console.log(`${report.fromRevision} -> ${report.toRevision}`);
    for (const update of report.moduleUpdates) {
      console.log(`  ${update.id}: ${update.from} -> ${update.to}`);
    }
    const counts = Object.entries(report.summary)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    console.log(counts.length > 0 ? `  ${counts}` : '  no file changes');

    if (report.applied === null) {
      console.log('Preview only — run without --check to apply.');
    }
    for (const path of report.conflicted) console.log(`conflict: ${path}`);
    if (report.conflicted.length > 0) {
      console.log(
        'Resolve the conflict markers, then commit. "git diff" shows everything that changed.',
      );
    }
    for (const note of report.notes) console.log(`note: ${note}`);
  },
});

function reportChange(verb: string, report: ChangeReport): void {
  if (report.moduleIds.length === 0) {
    for (const note of report.notes) console.log(note);
    return;
  }

  console.log(`${verb}: ${report.moduleIds.join(', ')}`);
  const counts = Object.entries(report.summary)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
  if (counts.length > 0) console.log(`  ${counts}`);

  if (report.applied === null) console.log('Preview only — run without --check to apply.');
  for (const path of report.conflicted) console.log(`conflict: ${path}`);
  for (const note of report.notes) console.log(`note: ${note}`);
  if (report.env.length > 0) {
    console.log(`Set these environment variables: ${report.env.join(', ')}`);
  }
}

const moduleChangeArgs = {
  modules: {
    type: 'positional',
    required: true,
    description: 'Comma-separated module ids',
  },
  dir: { type: 'string', description: 'Project directory', default: '.' },
  check: { type: 'boolean', description: 'Preview without writing', default: false },
  force: { type: 'boolean', description: 'Allow a dirty working tree', default: false },
  registry: { type: 'string', description: 'Path to an alternative registry.json' },
  kit: { type: 'string', description: 'Path to a local kit checkout instead of downloading' },
} as const;

const addCommand = defineCommand({
  meta: { name: 'add', description: 'Install modules into this project.' },
  args: moduleChangeArgs,
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const report = await runAdd({
      projectRoot: args.dir,
      registry,
      moduleIds: args.modules
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
      check: args.check,
      force: args.force,
      resolveLocalKit: () => args.kit || undefined,
    });
    reportChange('Added', report);
  },
});

const removeCommand = defineCommand({
  meta: { name: 'remove', description: 'Uninstall modules from this project.' },
  args: moduleChangeArgs,
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const report = await runRemove({
      projectRoot: args.dir,
      registry,
      moduleIds: args.modules
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
      check: args.check,
      force: args.force,
      resolveLocalKit: () => args.kit || undefined,
    });
    reportChange('Removed', report);
  },
});

const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Show installed modules and local changes.' },
  args: {
    dir: { type: 'string', description: 'Project directory', default: '.' },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined).catch(() => null);
    const report = await runStatus({ projectRoot: args.dir, registry });

    console.log(`kit revision: ${report.revision}`);
    if (report.updateAvailable) {
      console.log(`update available: ${report.registryRevision} (run "nuxt-saas upgrade --check")`);
    } else if (report.channel !== null) {
      console.log(
        `tracking ${report.channel}; run "nuxt-saas upgrade --check" to see whether it moved`,
      );
    }
    for (const module of report.modules) {
      const version =
        module.registryVersion && module.registryVersion !== module.version
          ? `${module.version} -> ${module.registryVersion}`
          : module.version;
      console.log(`${module.id}@${version}`);
      for (const path of module.modified) console.log(`  modified: ${path}`);
      for (const path of module.missing) console.log(`  missing:  ${path}`);
      for (const path of module.orphaned) console.log(`  orphaned: ${path}`);
    }
    for (const path of report.damagedMarkers) console.log(`damaged markers: ${path}`);
  },
});

const diffCommand = defineCommand({
  meta: { name: 'diff', description: 'Show what upstream changed compared to this project.' },
  args: {
    dir: { type: 'string', description: 'Project directory', default: '.' },
    file: { type: 'string', description: 'Limit the diff to one path' },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
    kit: { type: 'string', description: 'Path to a local kit checkout instead of downloading' },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const entries = await runDiff({
      projectRoot: args.dir,
      registry,
      ...(args.file ? { paths: [args.file] } : {}),
      ...(args.kit ? { localKitRoot: args.kit } : {}),
    });

    const changed = entries.filter((entry) => entry.status === 'changed');
    if (changed.length === 0) {
      console.log('No upstream differences.');
      return;
    }
    for (const entry of changed) console.log(entry.patch);
  },
});

const subCommands = {
  init: initCommand,
  modules: modulesCommand,
  add: addCommand,
  remove: removeCommand,
  upgrade: upgradeCommand,
  status: statusCommand,
  diff: diffCommand,
};

const rootCommand = defineCommand({
  meta: { name: 'nuxt-saas', description: 'Create and upgrade Nuxt SaaS projects.' },
  subCommands,
});

/**
 * Reads `npm create nuxt-saas my-app` as `init my-app`, and a bare
 * `npm create nuxt-saas` as `init`.
 *
 * That invocation is the convention every scaffolder is reached through, and npm
 * passes the directory straight to the binary — so a leading argument that names
 * no subcommand is the project the user wants created, and no argument at all is
 * still a request to create one.
 *
 * Help flags are not considered here: {@link resolveHelpTarget} intercepts them
 * before anything runs, so `my-app --help` can be routed to `init` like any
 * other directory without that routing causing a project to be generated.
 */
export function withDefaultCommand(argv: string[]): string[] {
  const first = argv.find((argument) => !argument.startsWith('-'));
  if (first !== undefined) return first in subCommands ? argv : ['init', ...argv];
  if (argv.includes('--help') || argv.includes('-h')) return argv;
  return ['init', ...argv];
}

/**
 * Whether `argv` is asking how to use the tool rather than asking it to run.
 *
 * `runCommand` treats `--help` as an ordinary argument, so without this
 * `nuxt-saas init --help` generates a project instead of explaining how to
 * generate one — and once a bare directory routes to `init`, so does
 * `nuxt-saas my-app --help`.
 */
export function isHelpRequest(argv: string[]): boolean {
  return argv.includes('--help') || argv.includes('-h');
}

/**
 * citty throws these when it cannot pick a subcommand — none given, or one it
 * does not know. Either way the useful response is the usage text, not a stack
 * trace naming an internal error code.
 */
function isMissingCommand(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'E_NO_COMMAND' || error.code === 'E_UNKNOWN_COMMAND')
  );
}

export async function main(argv: string[]): Promise<number> {
  try {
    // Checked before running anything: asking how a command works must never be
    // the same as running it.
    if (isHelpRequest(argv)) {
      await showUsage(rootCommand);
      return 0;
    }

    await runCommand(rootCommand, { rawArgs: withDefaultCommand(argv) });
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      return 1;
    }
    if (isMissingCommand(error)) {
      await showUsage(rootCommand);
      return 1;
    }
    throw error;
  }
}

export async function runMain(): Promise<void> {
  process.exitCode = await main(process.argv.slice(2));
}
