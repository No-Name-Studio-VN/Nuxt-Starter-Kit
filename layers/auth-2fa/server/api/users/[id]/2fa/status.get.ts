import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import userTwoFactorService from '#layers/auth-2fa/server/utils/database/userTwoFactor';
import { BACKUP_CODE_COUNT } from '#layers/auth-2fa/shared/constants/totp';
import type { TwoFactorStatusPayload } from '#layers/auth-2fa/types/twoFactor';
import { success } from '#layers/server-core/server/utils/apiResponse';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);
  setResponseHeader(event, 'Cache-Control', 'private, no-store');
  const twoFactor = await userTwoFactorService.getById(userId);
  const response: TwoFactorStatusPayload = {
    enabled: twoFactor?.enabled ?? false,
    // Only successful setup verification updates this field. Legacy rows retain their original setup date.
    enabledAt: twoFactor?.enabled ? twoFactor.updatedAt?.toISOString() ?? null : null,
    backupCodesRemaining: twoFactor?.enabled ? twoFactor.backupCodes?.length ?? 0 : 0,
    backupCodesTotal: twoFactor?.enabled ? BACKUP_CODE_COUNT : 0,
  };
  return success(response);
});
