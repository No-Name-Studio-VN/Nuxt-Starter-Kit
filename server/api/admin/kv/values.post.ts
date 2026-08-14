import { adminKvValuesPayloadSchema } from '#shared/schemas/adminKvSchema';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import { serializeAdminKvValue } from '~~/server/utils/adminKv';
import { useKV } from '~~/server/utils/kv';
import type { AdminKvValuesResponsePayload } from '~~/types/admin';

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
