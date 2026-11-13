import userService from '#layers/auth/server/utils/database/user';
import { apiError, success } from '#layers/server-core/server/utils/apiResponse';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The provided user ID is not a valid number.',
      code: 'INVALID_USER_ID',
    });
  }

  await userService.delete(id);
  return success({});
});
