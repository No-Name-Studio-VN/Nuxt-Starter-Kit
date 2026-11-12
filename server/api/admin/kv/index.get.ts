import { success } from '#layers/server-core/server/utils/apiResponse';
import { getAdminKvKeyRow } from '~~/server/utils/adminKv';
import { useKV } from '#layers/server-core/server/utils/kv';
import type { AdminKvKeysPayload } from '#layers/admin/types/admin';

export default defineEventHandler(async () => {
  const keys = await useKV().keys();
  const rows = keys
    .map((key) => getAdminKvKeyRow(key))
    .sort((current, next) => current.key.localeCompare(next.key));

  const payload: AdminKvKeysPayload = {
    keys: rows,
    total: rows.length,
  };

  return success(payload);
});
