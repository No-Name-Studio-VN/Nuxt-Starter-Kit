import type { User } from '#layers/auth/types/auth';
import userService from '#layers/auth/server/utils/database/user';

export default defineEventHandler(async () => {
  const response: User[] = await userService.getList();
  return success(response);
});
