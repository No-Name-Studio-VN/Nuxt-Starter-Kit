import { apiError, success } from '~~/server/utils/apiResponse';
import { adminBulkUserDeleteSchema } from '#shared/schemas/userSchema';
import userService from '~~/server/utils/database/user';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const result = adminBulkUserDeleteSchema.safeParse(body);
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      code: 'INVALID_USER_IDS',
      message: 'A non-empty array of user IDs is required.',
    });
  }

  const deletion = await userService.bulkDelete(result.data.userIds);
  return success({ deleted: deletion });
});
