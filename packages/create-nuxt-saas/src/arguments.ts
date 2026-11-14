import type { ArgsDef } from 'citty';

export const kitArgs = {
  kit: { type: 'string', description: 'Use a local kit checkout' },
  'allow-dirty-kit': {
    type: 'boolean',
    description: 'Allow uncommitted changes in the local kit',
    default: false,
  },
} satisfies ArgsDef;

export const templateArg = {
  template: { type: 'string', description: 'Kit template: github:owner/repo#ref' },
} satisfies ArgsDef;

export const initArgs = {
  ...kitArgs,
  ...templateArg,
  dir: { type: 'positional', description: 'Project directory', required: false },
  modules: { type: 'string', description: 'Comma-separated modules (empty means base only)' },
  yes: { type: 'boolean', alias: 'y', description: 'Use defaults without prompts', default: false },
  git: {
    type: 'boolean',
    description: 'Initialize git and create an initial commit',
    default: true,
  },
} satisfies ArgsDef;

export const projectArgs = {
  ...kitArgs,
  dir: { type: 'string', description: 'Project directory', default: '.' },
} satisfies ArgsDef;

export const transitionArgs = {
  ...projectArgs,
  check: { type: 'boolean', description: 'Preview without writing files', default: false },
  force: {
    type: 'boolean',
    description: 'Allow a dirty project tree or a project without git',
    default: false,
  },
} satisfies ArgsDef;

export const moduleChangeArgs = {
  ...transitionArgs,
  modules: { type: 'positional', description: 'Comma-separated module ids', required: true },
} satisfies ArgsDef;

export const upgradeArgs = {
  ...transitionArgs,
  ...templateArg,
  to: { type: 'string', description: 'Target kit ref or commit (defaults to the template ref)' },
} satisfies ArgsDef;

export const listArgs = { ...projectArgs, ...templateArg } satisfies ArgsDef;
