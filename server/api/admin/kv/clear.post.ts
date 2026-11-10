import { success } from '#layers/server-core/server/utils/apiResponse';
import { useKV } from '#layers/server-core/server/utils/kv';
import type { ClearedPayload } from '~~/types/admin';

export default defineEventHandler(async () => {
  await useKV().clear();
  await useStorage('cache').clear();

  const payload: ClearedPayload = { cleared: true };
  return success(payload, 'KV namespace and server cache cleared successfully');
});
