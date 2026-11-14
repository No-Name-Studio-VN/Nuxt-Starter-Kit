import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { CliError } from '../errors';
import type { KitOptions } from '../types/cli';
import { parseTemplate, resolveCommit, type KitSource } from './source';

const run = promisify(execFile);

export function kitSource(args: KitOptions, template: string): KitSource {
  const parsed = parseTemplate(template);
  return args.kit
    ? { kind: 'local', path: resolve(args.kit), allowDirty: args['allow-dirty-kit'] }
    : { kind: 'github', ...parsed };
}

export async function targetCommit(source: KitSource, ref: string | undefined): Promise<string> {
  if (source.kind === 'github') {
    return resolveCommit({ ...source, ref: ref ?? source.ref });
  }
  const head = await resolveCommit(source);
  if (!ref) return head;
  try {
    const { stdout } = await run('git', [
      '-C',
      source.path,
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${ref}^{commit}`,
    ]);
    const commit = stdout.trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full commit SHA.');
    return commit;
  } catch (error) {
    throw new CliError(
      `Unable to resolve local kit ref "${ref}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
