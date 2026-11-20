import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import userService from '#layers/auth/server/utils/database/user';
import { updateUsernameSchema } from '#layers/auth/shared/schemas/userSchema';
import type { UsernameAvailabilityData } from '#layers/auth/types/models/profile';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const result = updateUsernameSchema.safeParse(getQuery(event));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      code: 'VALIDATION_ERROR',
      message: 'Invalid request.',
      fieldErrors: zodErrorToFieldErrors(result.error),
      cause: result.error,
    });
  }

  const existingUser = await userService.getByUsername(result.data.username);
  return success<UsernameAvailabilityData>({
    available: !existingUser || existingUser.id === Number(session.user.id),
  });
});
