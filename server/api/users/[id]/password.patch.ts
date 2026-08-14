import { changePasswordSchema } from '#shared/schemas/userSchema';
import userService from '~~/server/utils/database/user';
import { getAuthorizedUserId } from '~~/server/utils/authorization';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import type { PasswordUpdatePayload } from '~~/types/userSecurity';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);

  const result = await readValidatedBody(event, (body) => changePasswordSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The password change request contains invalid data.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  // Get current user
  const user = await userService.getById(userId);
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. The requested user account does not exist.',
      code: 'USER_NOT_FOUND',
    });
  }

  // Verify current password
  const isValidPassword = await verifyPassword(user.password, result.data.currentPassword);
  if (!isValidPassword) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. The current password provided is incorrect.',
      code: 'INVALID_CURRENT_PASSWORD',
    });
  }

  // Hash new password
  const hashedPassword = await hashPassword(result.data.newPassword);

  // Update password
  const updatedUser = await userService.update({
    id: userId,
    password: hashedPassword,
  });

  if (!updatedUser) {
    throw apiError({
      status: 500,
      statusText: 'Internal Server Error',
      message: 'Internal Server Error. Failed to update the password.',
      code: 'PASSWORD_UPDATE_FAILED',
    });
  }

  const response: PasswordUpdatePayload = { message: 'Password updated successfully' };
  return success(response);
});
