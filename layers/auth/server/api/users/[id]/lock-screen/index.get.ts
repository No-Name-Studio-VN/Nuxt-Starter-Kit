import { success } from '#layers/server-core/server/utils/apiResponse';
import userLockScreenService from '#layers/auth/server/utils/database/userLockScreen';
import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);
  const data = await userLockScreenService.getById(userId);

  return success(data);
});
