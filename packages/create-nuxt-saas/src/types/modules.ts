import type { KitChangeNote } from '../kit/notes';

export interface KitModule {
  id: string;
  title: string;
  description: string;
  group?: string | undefined;
  parent?: string | undefined;
  requiresOneOf: string[];
  requires: string[];
  internal: boolean;
  installByDefault?: boolean | undefined;
  dependencies: string[];
  devDependencies: string[];
  scripts: string[];
  env: string[];
  bindings: string[];
  rootFiles: string[];
  changes: KitChangeNote[];
}

export interface ModuleGroup {
  name: string | undefined;
  entries: { module: KitModule; depth: number }[];
}
