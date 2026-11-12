import type { User } from '~~/types/auth';
import userService from '~~/server/utils/database/user';

export default defineEventHandler(async () => {
  const response: User[] = await userService.getList();
  return success(response);
});
