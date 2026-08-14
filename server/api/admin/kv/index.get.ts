import { success } from '~~/server/utils/apiResponse';
import { getAdminKvKeyRow } from '~~/server/utils/adminKv';
import { useKV } from '~~/server/utils/kv';
import type { AdminKvKeysPayload } from '~~/types/admin';

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
