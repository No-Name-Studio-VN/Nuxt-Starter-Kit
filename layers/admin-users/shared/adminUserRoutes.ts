import { adminRoutes } from '#layers/admin/shared/adminRoutes';

const { ADMIN_API_PREFIX } = adminRoutes;

export const adminUserRoutes = {
  ADMIN_USERS: ADMIN_API_PREFIX + '/users',
  ADMIN_USERS_DELETE: ADMIN_API_PREFIX + '/users/delete',

  adminUser: (userId: string | number) => ADMIN_API_PREFIX + `/users/${userId}`,
  adminUserLock: (userId: string | number) => ADMIN_API_PREFIX + `/users/${userId}/lock`,
};
