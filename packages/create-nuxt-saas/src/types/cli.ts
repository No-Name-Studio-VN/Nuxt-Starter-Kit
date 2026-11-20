import type { JsonDecision, JsonResolution } from './json';

import type { ParsedArgs } from 'citty';
import type { initArgs, kitArgs, undoArgs } from '../arguments';

export type KitOptions = Pick<ParsedArgs<typeof kitArgs>, 'kit' | 'allow-dirty-kit' | 'use-uncommitted-kit'>;
export type InitOptions = ParsedArgs<typeof initArgs>;
export type UndoOptions = ParsedArgs<typeof undoArgs>;

export interface LineChanges {
  added: number;
  removed: number;
}

export type ResolveChoice = JsonResolution['action'] | 'show' | 'decline' | 'skip' | 'quit' | 'cancel';

export interface ResolveView {
  decision: JsonDecision;
  index: number;
  total: number;
  counts: { yours: LineChanges; kit: LineChanges } | null;
}

export interface ResolveOptions {
  projectRoot: string;
  path?: string;
  action?: JsonResolution['action'];
  decline?: boolean;
  all?: boolean;
  walkthrough?: {
    show: (view: ResolveView) => void;
    choose: (view: ResolveView) => Promise<ResolveChoice>;
    showSides: (sides: string) => void;
    showError: (message: string) => void;
  };
}
