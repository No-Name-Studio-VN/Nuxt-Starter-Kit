import { resolve } from 'node:path';
import type { ParsedArgs } from 'citty';
import type { declineArgs } from '../arguments';
import { CliError } from '../errors';
import { readState, updateDeclined, writeState } from '../project/state';
import { parseModules } from '../prompts';
import { printJson } from '../report';
import { JSON_SCHEMA } from '../types/json';

export async function declineCommand(args: ParsedArgs<typeof declineArgs>): Promise<number> {
  const projectRoot = resolve(args.dir);
  const ids = parseModules(args.ids);
  if (!ids.length) throw new CliError('Provide at least one change note id.');
  const state = await readState(projectRoot);
  const declined = updateDeclined(state.declined, ids, args.revert);
  if (declined.join(',') !== state.declined.join(',')) await writeState(projectRoot, { ...state, declined });
  if (args.json) printJson({ schema: JSON_SCHEMA, declined });
  else console.log(declined.length ? `Declined changes: ${declined.join(', ')}` : 'No declined changes.');
  return 0;
}
