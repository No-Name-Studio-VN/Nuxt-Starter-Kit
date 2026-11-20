import type { InspectReport } from '../commands/inspect';
import type { KitModule } from '../kit/modules';
import type { ChangeKind } from '../transition/plan';

export const JSON_SCHEMA = 1;

export interface JsonFileChange {
  path: string;
  kind: ChangeKind;
}

export interface JsonUnsaved {
  total: number;
  risky: { path: string; kind: 'conflict' | 'keep-edited' }[];
  touched: string[];
  untouched: number;
}

export interface JsonBackup {
  ref: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'complete' | 'failed' | 'restored';
}

export interface JsonUndoReport {
  schema: typeof JSON_SCHEMA;
  backup: JsonBackup | null;
  restorable: boolean;
  blocked: {
    reason: 'no-backup' | 'moved-head' | 'changes' | 'pending';
    message: string;
    paths: string[];
  } | null;
  restored: boolean;
  files: number;
}

export interface JsonBackupList {
  schema: typeof JSON_SCHEMA;
  backups: JsonBackup[];
}

export interface JsonChangeNote {
  id: string;
  module: string;
  title: string;
  kind: 'feature' | 'fix' | 'security';
  since: string;
  files: string[];
}

export interface JsonNoteReport extends JsonChangeNote {
  outcome: 'applied' | 'kept' | 'conflict' | 'declined';
  affected: string[];
}

export interface JsonSuggestion {
  path: string;
  action: JsonResolution['action'] | 'by-hand';
  reason: string;
  notes: string[];
}

export interface JsonDecision {
  path: string;
  kind: 'conflict' | 'keep-edited';
  pending: boolean;
  suggestion: JsonSuggestion | null;
  notes: JsonChangeNote[];
  resolution: JsonResolution['action'] | null;
  hasKitVersion: boolean;
}

export interface JsonDecisionsReport {
  schema: typeof JSON_SCHEMA;
  decisions: JsonDecision[];
  resolved?: Pick<JsonResolution, 'path' | 'action'>;
}

export interface JsonDeclineReport {
  schema: typeof JSON_SCHEMA;
  declined: string[];
}

export interface JsonInspectFeatures {
  missing: JsonNoteReport[];
  declined: string[];
}

export interface JsonNotesReport {
  schema: typeof JSON_SCHEMA;
  notes: JsonChangeNote[];
  uncovered?: string[];
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
  unsaved: JsonUnsaved | null;
  backup: JsonBackup | null;
  report: string | null;
  notes: JsonNoteReport[];
  suggestions: JsonSuggestion[];
}

export interface JsonResolution {
  path: string;
  action: 'take-kit' | 'combine' | 'keep-mine';
  at: string;
}

export interface JsonSavedReport extends JsonTransitionReport {
  command: 'upgrade' | 'add' | 'remove';
  createdAt: string;
  fromVersion: string | null;
  toVersion: string | null;
  resolutions: JsonResolution[];
}

export interface JsonErrorReport {
  schema: typeof JSON_SCHEMA;
  error: { message: string; kind: 'expected' | 'unexpected' };
}

export interface JsonModulesReport {
  schema: typeof JSON_SCHEMA;
  commit: string;
  modules: KitModule[];
  installed: string[];
}

export type JsonInspectReport = { schema: typeof JSON_SCHEMA } & InspectReport;

export type JsonDocument =
  | JsonTransitionReport
  | JsonUndoReport
  | JsonBackupList
  | JsonDecisionsReport
  | JsonDeclineReport
  | JsonNotesReport
  | JsonModulesReport
  | JsonInspectReport
  | JsonErrorReport;
