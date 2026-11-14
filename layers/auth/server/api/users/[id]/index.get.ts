import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import { success } from '#layers/server-core/server/utils/apiResponse';
import { getUserProfileById } from '#layers/auth/server/utils/userProfile';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);
  const response = await getUserProfileById(userId);

  return success(response);
});
