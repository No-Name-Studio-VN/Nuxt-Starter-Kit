import { success } from '~~/server/utils/apiResponse';
import { useKV } from '~~/server/utils/kv';
import type { ClearedPayload } from '~~/types/admin';

export default defineEventHandler(async () => {
  await useKV().clear();
  await useStorage('cache').clear();

  const payload: ClearedPayload = { cleared: true };
  return success(payload, 'KV namespace and server cache cleared successfully');
});
