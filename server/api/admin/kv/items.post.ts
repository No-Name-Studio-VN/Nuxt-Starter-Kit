import { adminKvMutationSchema } from '#shared/schemas/adminKvSchema';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import { getAdminKvWriteValue, serializeAdminKvValue } from '~~/server/utils/adminKv';
import { useKV } from '~~/server/utils/kv';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => adminKvMutationSchema.safeParse(body));

  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The submitted KV item is invalid.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const kv = useKV();
  const existingKeys = await kv.keys();

  if (existingKeys.includes(result.data.key)) {
    throw apiError({
      status: 409,
      statusText: 'Conflict',
      message: `KV key "${result.data.key}" already exists.`,
      code: 'KV_KEY_ALREADY_EXISTS',
    });
  }

  const writeValue = getAdminKvWriteValue(result.data.value, result.data.mode);

  if (!writeValue.success || writeValue.value === undefined) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: writeValue.message ?? 'Bad Request. The submitted JSON value is invalid.',
      code: 'INVALID_JSON_VALUE',
      fieldErrors: {
        value: [writeValue.message ?? 'Invalid JSON value.'],
      },
    });
  }

  await kv.set(result.data.key, writeValue.value);

  return success(serializeAdminKvValue(result.data.key, writeValue.value));
});
