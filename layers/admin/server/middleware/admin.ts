import userService from '#layers/auth/server/utils/database/user';
import { apiError } from '#layers/server-core/server/utils/apiResponse';
import { adminRoutes } from '#layers/admin/shared/adminRoutes';

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;
  if (path === adminRoutes.ADMIN_TASKS_SEED_ADMIN) return;

  if (path.startsWith(adminRoutes.ADMIN_API_PREFIX)) {
    const session = await requireUserSession(event);
    const user = await userService.getById(session.user.id);
    if (!user) {
      throw apiError({
        status: 404,
        statusText: 'Not Found',
        message: 'User not found.',
        code: 'RESOURCE_ACCESS_DENIED',
      });
    }

    if (!user.isAdmin) {
      throw apiError({
        status: 403,
        statusText: 'Forbidden',
        message: 'Administrator access is required.',
        code: 'ADMIN_REQUIRED',
      });
    }
  }
});
