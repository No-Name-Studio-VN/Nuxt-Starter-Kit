import userService from '~~/server/utils/database/user';
import { success } from '#layers/server-core/server/utils/apiResponse';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  await userService.delete(session.user.id);

  return success({});
});
