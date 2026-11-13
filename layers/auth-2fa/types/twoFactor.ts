import type { tables } from '#layers/database/server/utils/db';

export type DBTwoFactor = typeof tables.userTwoFactor.$inferSelect;

export interface TwoFactorSetupPayload {
  uri: string;
  secret: string;
}

export interface TwoFactorVerifyPayload {
  backupCodes: string[];
}

export interface LockScreenValidationPayload {
  valid: boolean;
}
