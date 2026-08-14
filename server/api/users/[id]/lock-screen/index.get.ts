import { success } from '~~/server/utils/apiResponse';
import userLockScreenService from '~~/server/utils/database/userLockScreen';
import { getAuthorizedUserId } from '~~/server/utils/authorization';
import { toClientSafeLockScreen } from '~~/server/utils/lockScreenHelpers';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);
  const data = await userLockScreenService.getById(userId);

  // Don't send pinHash to client for security
  return success(toClientSafeLockScreen(data));
});
