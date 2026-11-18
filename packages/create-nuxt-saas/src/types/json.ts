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

export type JsonDocument = JsonTransitionReport | JsonErrorReport;
