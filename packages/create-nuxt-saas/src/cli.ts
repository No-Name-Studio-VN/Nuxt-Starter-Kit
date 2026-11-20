import { defineCommand, runCommand, showUsage, type ArgsDef, type CommandDef } from 'citty';
import { declineArgs, initArgs, inspectArgs, listArgs, moduleChangeArgs, notesArgs, resolveArgs, undoArgs, upgradeArgs } from './arguments';
import {
  initCommand,
  inspectCommand,
  moduleCommand,
  modulesCommand,
  resolveCommand,
  upgradeCommand,
} from './commands/dispatch';
import { declineCommand } from './commands/decline';
import { notesCommand } from './commands/notes';
import { undoCommand } from './commands/undo';
import { CliError } from './errors';
import { printJson } from './report';
import { JSON_SCHEMA } from './types/json';

function route<T extends ArgsDef>(command: CommandDef<T>) {
  return {
    command: defineCommand(command),
    run: (rawArgs: string[]) => runCommand(command, { rawArgs }),
    help: () => showUsage(command),
  };
}

export async function main(argv: string[]): Promise<number> {
  let exitCode = 0;
  const json = argv.includes('--json');
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
    undo: route({
      meta: { name: 'undo', description: 'Restore a project backup before committing a transition' },
      args: undoArgs,
      async run({ args }) {
        exitCode = await undoCommand(args);
      },
    }),
    resolve: route({
      meta: { name: 'resolve', description: 'Review and resolve upgrade decisions' },
      args: resolveArgs,
      async run({ args }) {
        exitCode = await resolveCommand(args);
      },
    }),
    decline: route({
      meta: { name: 'decline', description: 'Remember kit changes you do not want' },
      args: declineArgs,
      async run({ args }) {
        exitCode = await declineCommand(args);
      },
    }),
    notes: route({
      meta: { name: 'notes', description: 'List or check the change notes in a local kit' },
      args: notesArgs,
      async run({ args }) {
        exitCode = await notesCommand(args);
      },
    }),
    modules: route({
      meta: { name: 'modules', description: 'List available and installed modules' },
      args: listArgs,
      async run({ args }) {
        exitCode = await modulesCommand(args);
      },
    }),
    inspect: route({
      meta: { name: 'inspect', description: 'Show how a project differs from its kit render' },
      args: inspectArgs,
      async run({ args }) {
        exitCode = await inspectCommand(args);
      },
    }),
  };
  const root = defineCommand({
    meta: {
      name: 'nuxt-saas',
      version: '3.2.0',
      description: 'Create and manage modular Nuxt SaaS projects',
    },
    subCommands: {
      init: commands.init.command,
      add: commands.add.command,
      remove: commands.remove.command,
      upgrade: commands.upgrade.command,
      undo: commands.undo.command,
      resolve: commands.resolve.command,
      decline: commands.decline.command,
      notes: commands.notes.command,
      modules: commands.modules.command,
      inspect: commands.inspect.command,
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
    const expected =
      error instanceof CliError || (error instanceof Error && error.name === 'CLIError');
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      printJson({
        schema: JSON_SCHEMA,
        error: { message, kind: expected ? 'expected' : 'unexpected' },
      });
    } else if (expected) {
      console.error(message);
    } else {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
    return expected ? 1 : 2;
  }
}

export async function runMain(): Promise<void> {
  process.exitCode = await main(process.argv.slice(2));
}
