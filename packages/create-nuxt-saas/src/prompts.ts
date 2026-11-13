import { isCancel, multiselect, text } from '@clack/prompts';
import type { KitModule } from './kit/modules';
import type { InitOptions } from './types/cli';
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
