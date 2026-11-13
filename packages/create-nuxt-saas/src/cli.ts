import { defineCommand, runCommand, showUsage, type ArgsDef, type CommandDef } from 'citty';
import { initArgs, listArgs, moduleChangeArgs, upgradeArgs } from './arguments';
import { initCommand, moduleCommand, modulesCommand, upgradeCommand } from './commands/dispatch';
import { CliError } from './errors';

function route<T extends ArgsDef>(command: CommandDef<T>) {
  return {
    command: defineCommand(command),
    run: (rawArgs: string[]) => runCommand(command, { rawArgs }),
    help: () => showUsage(command),
  };
}

export async function main(argv: string[]): Promise<number> {
  let exitCode = 0;
  const commands = {
    init: route({
      meta: { name: 'init', description: 'Create a Nuxt SaaS project' },
      args: initArgs,
      async run({ args }) {
        exitCode = await initCommand(args);
      },
    }),
    add: route({
      meta: { name: 'add', description: 'Add modules and their dependencies' },
      args: moduleChangeArgs,
      async run({ args }) {
        exitCode = await moduleCommand(args, 'add');
      },
    }),
    remove: route({
      meta: { name: 'remove', description: 'Remove installed modules' },
      args: moduleChangeArgs,
      async run({ args }) {
        exitCode = await moduleCommand(args, 'remove');
      },
    }),
    upgrade: route({
      meta: { name: 'upgrade', description: 'Upgrade a project to a kit revision' },
      args: upgradeArgs,
      async run({ args }) {
        exitCode = await upgradeCommand(args);
      },
    }),
    modules: route({
      meta: { name: 'modules', description: 'List available and installed modules' },
      args: listArgs,
      async run({ args }) {
        exitCode = await modulesCommand(args);
      },
    }),
  };
  const root = defineCommand({
    meta: {
      name: 'nuxt-saas',
      version: '3.0.0',
      description: 'Create and manage modular Nuxt SaaS projects',
    },
    subCommands: {
      init: commands.init.command,
      add: commands.add.command,
      remove: commands.remove.command,
      upgrade: commands.upgrade.command,
      modules: commands.modules.command,
    },
  });
  try {
    // R34: unrecognized positional tokens are init directories, not command errors.
    const index = argv.findIndex((arg) => !arg.startsWith('-'));
    const selected = Object.entries(commands).find(([name]) => name === argv[index]);
    const command = selected?.[1] ?? commands.init;
    const rawArgs = selected ? argv.slice(index + 1) : argv;
    if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
      if (selected) await command.help();
      else await showUsage(root);
      return 0;
    }
    await command.run(rawArgs);
    return exitCode;
  } catch (error) {
    if (error instanceof CliError || (error instanceof Error && error.name === 'CLIError')) {
      console.error(error.message);
      return 1;
    }
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return 2;
  }
}

export async function runMain(): Promise<void> {
  process.exitCode = await main(process.argv.slice(2));
}
