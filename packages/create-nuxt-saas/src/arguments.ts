import type { ArgsDef } from 'citty';

export const kitArgs = {
  kit: { type: 'string', description: 'Use a local kit checkout' },
  'allow-dirty-kit': {
    type: 'boolean',
    description: 'Allow uncommitted changes in the local kit',
    default: false,
  },
  'use-uncommitted-kit': {
    type: 'boolean',
    description: 'Use a snapshot of uncommitted changes in the local kit',
    default: false,
  },
} satisfies ArgsDef;

export const templateArg = {
  template: { type: 'string', description: 'Kit template: github:owner/repo#ref' },
} satisfies ArgsDef;

const kitRefArg = { type: 'string', description: 'Kit ref or commit (defaults to the template ref)' } satisfies ArgsDef[string];

export const initArgs = {
  ...kitArgs,
  ...templateArg,
  to: kitRefArg,
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
  json: { type: 'boolean', description: 'Print one JSON document instead of text', default: false },
} satisfies ArgsDef;

export const transitionArgs = {
  ...projectArgs,
  check: { type: 'boolean', description: 'Preview without writing files', default: false },
  backup: { type: 'boolean', description: 'Back up the project before writing (use --no-backup to skip)', default: true },
  force: {
    type: 'boolean',
    description: 'Proceed over at-risk unsaved changes, or without git (with --no-backup)',
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
  to: kitRefArg,
} satisfies ArgsDef;

export const listArgs = {
  ...projectArgs,
  ...templateArg,
  to: { type: 'string', description: 'Kit ref or commit (outside a project only)' },
} satisfies ArgsDef;

export const inspectArgs = projectArgs;

export const undoArgs = {
  dir: projectArgs.dir,
  json: projectArgs.json,
  yes: { type: 'boolean', alias: 'y', description: 'Restore without prompting', default: false },
  check: { type: 'boolean', description: 'Check whether the project can be restored', default: false },
  list: { type: 'boolean', description: 'List project backups and their expiry dates', default: false },
  backup: { type: 'string', description: 'Name of the backup to restore (defaults to the newest)' },
} satisfies ArgsDef;

export const resolveArgs = {
  dir: projectArgs.dir,
  json: projectArgs.json,
  file: { type: 'positional', description: 'Decision file path', required: false },
  'keep-mine': { type: 'boolean', description: 'Keep your version', default: false },
  'take-kit': { type: 'boolean', description: 'Take the kit version', default: false },
  combine: { type: 'boolean', description: 'Combine both sides of conflict hunks', default: false },
  decline: { type: 'boolean', description: 'Decline change notes for this file (with --keep-mine)', default: false },
  all: { type: 'boolean', description: 'Include kept files in the walkthrough', default: false },
} satisfies ArgsDef;

export const declineArgs = {
  dir: projectArgs.dir,
  json: projectArgs.json,
  ids: { type: 'positional', description: 'Comma-separated change note ids', required: true },
  revert: { type: 'boolean', description: 'Clear refusals for these change notes', default: false },
} satisfies ArgsDef;

export const notesArgs = {
  kit: { ...kitArgs.kit, required: true },
  'allow-dirty-kit': kitArgs['allow-dirty-kit'],
  json: projectArgs.json,
  check: { type: 'boolean', description: 'Find kit files that lack a note for the current release', default: false },
  since: { type: 'string', description: 'Compare with this git ref (required with --check)' },
} satisfies ArgsDef;
