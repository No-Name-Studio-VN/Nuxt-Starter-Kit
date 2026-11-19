import type { tables } from '#layers/database/server/utils/db';

export type AuthTokenKind = string;

export interface AuthTokenKindRegistration {
  id: AuthTokenKind;
  expiresInMs: number;
}

export type DBAuthToken = typeof tables.authTokens.$inferSelect;
