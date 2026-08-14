import type { DBLockScreen, DBLockScreenClient } from '#shared/db';

/**
 * Transforms server-side lock screen data to client-safe format
 * Removes sensitive totpSecret and backupCodes and adds hasTotpSet boolean
 */
export function toClientSafeLockScreen(
  lockScreen: DBLockScreen | undefined,
): DBLockScreenClient | undefined {
  if (!lockScreen) {
    return undefined;
  }

  // oxlint-disable-next-line no-unused-vars We should not include totpSecret and backupCodes in the client-safe version
  const { totpSecret, backupCodes, ...rest } = lockScreen;

  return {
    ...rest,
    hasTotpSet: lockScreen.totpEnabled,
  };
}
