import { intro, isCancel, multiselect, outro, text } from '@clack/prompts';
import { defineCommand, runCommand } from 'citty';
import { runInit } from './commands/init';
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

const rootCommand = defineCommand({
  meta: { name: 'nuxt-starter', description: 'Create and upgrade Nuxt Starter Kit projects.' },
  subCommands: { init: initCommand, modules: modulesCommand },
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
