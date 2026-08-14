import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RenderWorkspace {
  root: string;
  cleanup: () => Promise<void>;
}

/** A scratch directory for pristine renders, removed once the caller is done. */
export async function makeRenderWorkspace(): Promise<RenderWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'nsk-render-'));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}
