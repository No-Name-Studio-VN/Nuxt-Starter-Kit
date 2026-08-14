import { join } from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { readManifest } from '../manifest/io';
import { resolveModules } from '../registry/resolve';
import type { Registry } from '../registry/schema';
import { renderKit } from '../render/render';
import { fetchKit } from '../sources/fetchKit';
import { makeRenderWorkspace } from '../upgrade/workspace';
import { pathExists, readTextFile } from '../util/fs';
import { resolveInside } from '../util/paths';

export interface DiffEntry {
  path: string;
  status: 'changed' | 'unchanged' | 'missing' | 'binary';
  patch: string;
}

export interface DiffOptions {
  projectRoot: string;
  registry: Registry;
  paths?: string[];
  localKitRoot?: string;
}

export async function runDiff(options: DiffOptions): Promise<DiffEntry[]> {
  const manifest = await readManifest(options.projectRoot);
  const available = new Set(options.registry.modules.map((module) => module.id));
  const ids = manifest.modules.map((module) => module.id).filter((id) => available.has(id));

  const kit = await fetchKit({
    template: options.registry.kit.template,
    revision: options.registry.kit.revision,
    ...(options.localKitRoot === undefined ? {} : { localKitRoot: options.localKitRoot }),
  });
  const workspace = await makeRenderWorkspace();

  try {
    const rendered = await renderKit({
      kitRoot: kit.root,
      registryModules: options.registry.modules,
      modules: ids.length === 0 ? [] : resolveModules(options.registry, ids),
      placeholders: manifest.placeholders,
      destinationRoot: workspace.root,
    });

    const wanted = options.paths ?? rendered.map((file) => file.path);
    const entries: DiffEntry[] = [];

    for (const path of wanted) {
      const projectPath = resolveInside(options.projectRoot, path, 'Project file');
      if (!(await pathExists(projectPath))) {
        entries.push({ path, status: 'missing', patch: '' });
        continue;
      }

      const [local, upstream] = await Promise.all([
        readTextFile(projectPath),
        readTextFile(join(workspace.root, path)),
      ]);
      if (local === null || upstream === null) {
        entries.push({ path, status: 'binary', patch: '' });
        continue;
      }
      if (local === upstream) {
        entries.push({ path, status: 'unchanged', patch: '' });
        continue;
      }

      entries.push({
        path,
        status: 'changed',
        patch: createTwoFilesPatch(`local/${path}`, `upstream/${path}`, local, upstream),
      });
    }

    return entries;
  } finally {
    await workspace.cleanup();
    await kit.cleanup();
  }
}
