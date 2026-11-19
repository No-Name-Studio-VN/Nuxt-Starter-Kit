import type { InspectReport } from '../commands/inspect';
import type { KitModule } from './modules';
import type { ChangeKind } from '../transition/plan';

export const JSON_SCHEMA = 1;

export interface JsonFileChange {
  path: string;
  kind: ChangeKind;
}

export interface JsonTransitionReport {
  schema: typeof JSON_SCHEMA;
  from: string;
  to: string;
  changes: JsonFileChange[];
  conflicts: string[];
  followUps: string[];
  addedModules: string[];
  removedModules: string[];
  applied: boolean;
  upToDate?: boolean;
}

export interface JsonErrorReport {
  schema: typeof JSON_SCHEMA;
  error: { message: string; kind: 'expected' | 'unexpected' };
}

export interface JsonModule extends Omit<KitModule, 'group' | 'parent'> {
  group: string | null;
  parent: string | null;
}

export interface JsonModulesReport {
  schema: typeof JSON_SCHEMA;
  commit: string;
  groups: string[];
  modules: JsonModule[];
  installed: string[];
}

export type JsonInspectReport = { schema: typeof JSON_SCHEMA } & InspectReport;

export type JsonDocument =
  | JsonTransitionReport
  | JsonModulesReport
  | JsonInspectReport
  | JsonErrorReport;
