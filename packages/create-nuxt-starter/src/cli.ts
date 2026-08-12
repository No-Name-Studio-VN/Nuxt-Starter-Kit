import { intro, isCancel, multiselect, outro, text } from '@clack/prompts';
import { defineCommand, runCommand } from 'citty';
import type { ChangeReport } from './commands/add';
import { runAdd } from './commands/add';
import { runDiff } from './commands/diff';
import { runInit } from './commands/init';
import { runRemove } from './commands/remove';
import { runStatus } from './commands/status';
import { runUpgrade } from './commands/upgrade';
import { CliError } from './errors';
import { loadRegistry } from './registry/load';
import type { Registry } from './registry/schema';
import type { Placeholders } from './render/placeholders';

function cancelled(): never {
  throw new CliError('Cancelled.');
}

async function promptModules(registry: Registry): Promise<string[]> {
  const selection = await multiselect({
    message: 'Which modules do you want?',
    options: registry.modules.map((module) => ({
      value: module.id,
      label: module.title,
      hint: module.description,
    })),
    required: true,
  });
  if (isCancel(selection)) cancelled();
  return selection;
}

async function promptPlaceholders(defaultName: string): Promise<Placeholders> {
  const projectName = await text({
    message: 'Project name',
    defaultValue: defaultName,
    placeholder: defaultName,
  });
  if (isCancel(projectName)) cancelled();

  const description = await text({
    message: 'Description',
    defaultValue: '',
    placeholder: 'A Nuxt application',
  });
  if (isCancel(description)) cancelled();

  return { PROJECT_NAME: projectName, PROJECT_DESCRIPTION: description };
}

const initCommand = defineCommand({
  meta: { name: 'init', description: 'Create a new project from the starter kit.' },
  args: {
    dir: { type: 'string', description: 'Target directory', default: '.' },
    modules: { type: 'string', description: 'Comma-separated module ids (skips the picker)' },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
    kit: { type: 'string', description: 'Path to a local kit checkout instead of downloading' },
    yes: { type: 'boolean', description: 'Skip prompts and use defaults', default: false },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const interactive = !args.yes && process.stdout.isTTY === true;
    if (interactive) intro('Nuxt Starter Kit');

    const moduleIds = args.modules
      ? args.modules
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : interactive
        ? await promptModules(registry)
        : registry.modules.map((module) => module.id);

    const defaultName =
      args.dir === '.' ? 'my-app' : (args.dir.split('/').filter(Boolean).at(-1) ?? 'my-app');
    const placeholders = interactive
      ? await promptPlaceholders(defaultName)
      : { PROJECT_NAME: defaultName, PROJECT_DESCRIPTION: '' };

    const result = await runInit({
      registry,
      targetDir: args.dir,
      moduleIds,
      placeholders,
      ...(args.kit ? { localKitRoot: args.kit } : {}),
    });

    const summary = `Created ${result.projectRoot} with ${result.moduleIds.join(', ')} (${result.fileCount} files).`;
    if (interactive) outro(summary);
    else console.log(summary);

    for (const note of result.notes) console.log(`note: ${note}`);
    if (result.env.length > 0) {
      console.log(`Set these environment variables: ${result.env.join(', ')}`);
    }
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
      console.log(`${module.id}@${module.version}${requires} — ${module.description}`);
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
      console.log(
        `update available: ${report.registryRevision} (run "nuxt-starter upgrade --check")`,
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

const rootCommand = defineCommand({
  meta: { name: 'nuxt-starter', description: 'Create and upgrade Nuxt Starter Kit projects.' },
  subCommands: {
    init: initCommand,
    modules: modulesCommand,
    add: addCommand,
    remove: removeCommand,
    upgrade: upgradeCommand,
    status: statusCommand,
    diff: diffCommand,
  },
});

export async function main(argv: string[]): Promise<number> {
  try {
    await runCommand(rootCommand, { rawArgs: argv });
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

export async function runMain(): Promise<void> {
  process.exitCode = await main(process.argv.slice(2));
}
