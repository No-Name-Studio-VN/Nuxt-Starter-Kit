import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import userLockScreenService from '#layers/auth/server/utils/database/userLockScreen';
import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import { updateUserLockScreenSettingsSchema } from '#layers/auth/shared/schemas';
import { toClientSafeLockScreen } from '#layers/auth/server/utils/lockScreenHelpers';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);

  const result = await readValidatedBody(event, (body) =>
    updateUserLockScreenSettingsSchema.safeParse(body),
  );
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The lock screen settings are invalid.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  // Update settings (security fields like pinHash, failedAttempts are excluded by schema)
  const data = await userLockScreenService.update({
    ...result.data,
    userId,
    lastActivityTime: result.data.lastActivityTime || new Date(),
  });

  // Don't send pinHash to client for security
  return success(toClientSafeLockScreen(data));
});
