import { normalizeEmail } from '#shared/utils/normalizeEmail';
import { updateProfileSchema } from '#layers/auth/shared/schemas/userSchema';
import userService from '#layers/auth/server/utils/database/user';
import { isConstraintFailure } from '#layers/auth/server/utils/database/isConstraintFailure';
import { emailAlreadyInUseError } from '#layers/auth/server/utils/emailAlreadyInUseError';
import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import { runEmailChangedHooks } from '#layers/auth/server/utils/emailChangedHooks';
import { hasPassword } from '#layers/auth/server/utils/hasPassword';
import { refreshSessionUser } from '#layers/auth/server/utils/sessionUser';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import type { ProfileUpdateData } from '#layers/auth/types/models/profile';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);

  const result = await readValidatedBody(event, (body) => updateProfileSchema.safeParse(body));
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

  const currentUser = await userService.getById(userId);
  if (!currentUser) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      code: 'USER_NOT_FOUND',
      message: 'Not Found. The requested user account does not exist.',
    });
  }

  const { currentPassword, email, name } = result.data;
  const previousEmail = currentUser.email;
  const emailChanged = email !== normalizeEmail(previousEmail);
  if (emailChanged) {
    if (!hasPassword(currentUser)) {
      throw apiError({
        status: 403,
        statusText: 'Forbidden',
        code: 'EMAIL_CHANGE_REQUIRES_PASSWORD',
        message: 'Accounts without a password cannot change their email address.',
      });
    }

    if (!currentPassword || !(await verifyPassword(currentUser.password, currentPassword))) {
      throw apiError({
        status: 401,
        statusText: 'Unauthorized',
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Unauthorized. The current password provided is incorrect.',
        fieldErrors: { currentPassword: ['validation.current_password_incorrect'] },
      });
    }

    const matches = await userService.listByEmail(email);
    if (matches.some((user) => user.id !== userId)) {
      throw emailAlreadyInUseError();
    }
  }

  const updatedUser = await (emailChanged
    ? userService.updateEmail(userId, email, { name })
    : userService.update({ id: userId, name })
  ).catch((error: unknown) => {
    if (isConstraintFailure(error, 'UNIQUE constraint failed: users.email')) {
      throw emailAlreadyInUseError();
    }
    throw error;
  });

  if (!updatedUser) {
    throw apiError({
      status: 500,
      statusText: 'Internal Server Error',
      code: 'PROFILE_UPDATE_FAILED',
      message: 'Failed to update the user profile.',
    });
  }

  if (emailChanged) {
    await runEmailChangedHooks({ event, user: updatedUser, previousEmail });
  }

  await refreshSessionUser(event, updatedUser);

  const response: ProfileUpdateData = {
    id: updatedUser.id,
    username: updatedUser.username,
    name: updatedUser.name,
    email: updatedUser.email,
  };

  return success(response);
});
