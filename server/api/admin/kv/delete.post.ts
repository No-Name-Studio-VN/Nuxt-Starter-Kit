import { adminKvDeletePayloadSchema } from '#shared/schemas/adminKvSchema';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import { useKV } from '~~/server/utils/kv';
import type { AdminKvDeletePayload } from '~~/types/admin';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) =>
    adminKvDeletePayloadSchema.safeParse(body),
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
  await Promise.all(result.data.keys.map((key) => kv.del(key)));

  const payload: AdminKvDeletePayload = {
    deleted: result.data.keys.length,
  };

  return success(payload);
});
