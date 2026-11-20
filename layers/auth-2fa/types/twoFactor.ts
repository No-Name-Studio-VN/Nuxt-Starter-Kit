import type { tables } from '#layers/database/server/utils/db';

export type DBTwoFactor = typeof tables.userTwoFactor.$inferSelect;

export interface TwoFactorSetupPayload {
  uri: string;
  secret: string;
}

export interface TwoFactorBackupCodesPayload {
  backupCodes: string[];
}

export type TwoFactorVerifyPayload = TwoFactorBackupCodesPayload;

export interface TwoFactorStatusPayload {
  enabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
  backupCodesTotal: number;
}

export interface LockScreenValidationPayload {
  valid: boolean;
}
