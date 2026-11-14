import { adminRoutes } from '#layers/admin/shared/adminRoutes';

const { ADMIN_API_PREFIX } = adminRoutes;

export const adminKvRoutes = {
  ADMIN_KV: ADMIN_API_PREFIX + '/kv',
  ADMIN_KV_VALUES: ADMIN_API_PREFIX + '/kv/values',
  ADMIN_KV_ITEMS: ADMIN_API_PREFIX + '/kv/items',
  ADMIN_KV_DELETE: ADMIN_API_PREFIX + '/kv/delete',
  ADMIN_KV_CLEAR: ADMIN_API_PREFIX + '/kv/clear',
};
