import { success } from '#layers/server-core/server/utils/apiResponse';
import { getAdminKvKeyRow } from '#layers/admin-kv/server/utils/adminKv';
import { useKV } from '#layers/server-core/server/utils/kv';
import type { AdminKvKeysPayload } from '#layers/admin-kv/types/adminKv';

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
