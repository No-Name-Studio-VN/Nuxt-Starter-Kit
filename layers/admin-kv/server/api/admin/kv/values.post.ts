import { adminKvValuesPayloadSchema } from '#layers/admin-kv/shared/schemas/adminKvSchema';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { serializeAdminKvValue } from '#layers/admin-kv/server/utils/adminKv';
import { useKV } from '#layers/server-core/server/utils/kv';
import type { AdminKvValuesResponsePayload } from '#layers/admin-kv/types/adminKv';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) =>
    adminKvValuesPayloadSchema.safeParse(body),
  );

  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The submitted KV keys are invalid.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const kv = useKV();
  const values = await Promise.all(
    result.data.keys.map(async (key) => {
      const value: unknown = await kv.get(key);
      return serializeAdminKvValue(key, value);
    }),
  );

  const payload: AdminKvValuesResponsePayload = { values };

  return success(payload);
});
