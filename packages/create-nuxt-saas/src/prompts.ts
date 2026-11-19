import { groupMultiselect, isCancel, multiselect, text, type Option } from '@clack/prompts';
import { CliError } from './errors';
import { groupModules, resolveSelection, validateSelection } from './kit/modules';
import type { KitSnapshot } from './kit/source';
import type { InitOptions } from './types/cli';
import { DEFAULT_PROJECT_NAME, validateProjectName } from './util/projectName';

export function parseModules(value: string): string[] {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function promptInit(args: InitOptions, kit: Pick<KitSnapshot, 'modules' | 'groups'>) {
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
  if (args.modules !== undefined) return { dir, requested: parseModules(args.modules) };
  if (args.yes || !process.stdin.isTTY) return { dir, requested: [] };

  const sections = groupModules(
    kit.modules.filter((module) => !module.internal),
    kit.groups,
  );
  if (sections.length === 0) return { dir, requested: [] };

  const grouped: Record<string, Option<string>[]> = {};
  const ungrouped: Option<string>[] = [];
  for (const { name, entries } of sections) {
    const options = entries.map(({ module, depth }) => ({
      value: module.id,
      label: `${'  '.repeat(depth)}${module.title}`,
      hint: module.parent
        ? `${module.description} · Requires ${module.requires.join(', ')}`
        : module.description,
    }));
    // Clack takes a record. A leading space keeps numeric headings in the kit's order.
    if (name !== undefined) grouped[` ${name}`] = options;
    else ungrouped.push(...options);
  }

  let requested: string[] = [];
  while (true) {
    const options = {
      message: 'Which modules would you like?',
      required: false,
      initialValues: requested,
    };
    const selected = kit.groups
      ? await groupMultiselect({ ...options, selectableGroups: false, options: grouped })
      : await multiselect({ ...options, options: ungrouped });
    if (isCancel(selected)) return null;
    requested = selected;
    try {
      validateSelection(kit.modules, resolveSelection(kit.modules, requested));
      return { dir, requested };
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      console.error(error.message);
    }
  }
}
