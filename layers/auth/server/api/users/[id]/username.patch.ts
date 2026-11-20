import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import { isConstraintFailure } from '#layers/auth/server/utils/database/isConstraintFailure';
import userService from '#layers/auth/server/utils/database/user';
import { refreshSessionUser } from '#layers/auth/server/utils/sessionUser';
import { updateUsernameSchema } from '#layers/auth/shared/schemas/userSchema';
import type { ProfileUpdateData } from '#layers/auth/types/models/profile';

function usernameTakenError() {
  return apiError({
    status: 409,
    statusText: 'Conflict',
    code: 'USERNAME_TAKEN',
    message: 'This username is already taken.',
    fieldErrors: { username: ['auth.username_taken'] },
  });
}

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);

  const result = await readValidatedBody(event, (body) => updateUsernameSchema.safeParse(body));
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

  const { username } = result.data;
  const existingUser = await userService.getByUsername(username);
  if (existingUser && existingUser.id !== userId) {
    throw usernameTakenError();
  }

  const updatedUser = await userService.update({ id: userId, username }).catch((error: unknown) => {
    if (isConstraintFailure(error, 'UNIQUE constraint failed: users.username')) {
      throw usernameTakenError();
    }
    throw error;
  });
  if (!updatedUser) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      code: 'USER_NOT_FOUND',
      message: 'Not Found. The requested user account does not exist.',
    });
  }

  await refreshSessionUser(event, updatedUser);

  return success<ProfileUpdateData>({
    id: updatedUser.id,
    username: updatedUser.username,
    name: updatedUser.name,
    email: updatedUser.email,
  });
});
