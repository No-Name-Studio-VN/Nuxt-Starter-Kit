import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { downloadTemplate } from 'giget';
import { CliError } from '../errors';
import { pathExists } from '../util/fs';

export interface FetchKitOptions {
  template: string;
  revision: string;
  /** Bypasses downloading — used by tests and the `--kit` flag. */
  localKitRoot?: string;
}

export interface FetchedKit {
  root: string;
  cleanup: () => Promise<void>;
}

export async function fetchKit(options: FetchKitOptions): Promise<FetchedKit> {
  if (options.localKitRoot !== undefined) {
    const root = resolve(options.localKitRoot);
    if (!(await pathExists(root))) {
      throw new CliError(`Local kit root ${root} does not exist.`);
    }
    return { root, cleanup: async () => {} };
  }

  const source = `${options.template}#${options.revision}`;
  const directory = await mkdtemp(join(tmpdir(), 'nsk-kit-'));
  try {
    const result = await downloadTemplate(source, { dir: directory, force: true });
    return { root: result.dir, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to fetch kit ${source}: ${message}`);
  }
}
