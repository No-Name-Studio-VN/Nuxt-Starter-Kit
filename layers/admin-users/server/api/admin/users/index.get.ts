import type { SafeUser } from '#layers/auth/types/auth';
import userService from '#layers/auth/server/utils/database/user';

export default defineEventHandler(async () => {
  const response: SafeUser[] = await userService.getList();
  return success(response);
});
