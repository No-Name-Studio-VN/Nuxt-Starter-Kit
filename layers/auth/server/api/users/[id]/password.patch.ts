import { changePasswordSchema, setPasswordSchema } from '#layers/auth/shared/schemas/userSchema';
import userService from '#layers/auth/server/utils/database/user';
import { hasPassword } from '#layers/auth/server/utils/hasPassword';
import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import type { PasswordUpdatePayload } from '#layers/auth/types/userSecurity';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);
  const user = await userService.getById(userId);
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. The requested user account does not exist.',
      code: 'USER_NOT_FOUND',
    });
  }

  const changingPassword = hasPassword(user);
  if (!changingPassword && Number((await requireUserSession(event)).user.id) !== userId) {
    throw apiError({
      status: 403,
      statusText: 'Forbidden',
      message: 'You can only set an initial password on your own account.',
      code: 'USER_ID_MISMATCH',
    });
  }

  const result = await readValidatedBody(event, (body) => {
    return changingPassword
      ? changePasswordSchema.safeParse(body)
      : setPasswordSchema.safeParse(body);
  });
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The password change request contains invalid data.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const currentPassword = 'currentPassword' in result.data ? result.data.currentPassword : undefined;
  if (changingPassword && (
    typeof currentPassword !== 'string' || !(await verifyPassword(user.password, currentPassword))
  )) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. The current password provided is incorrect.',
      code: 'INVALID_CURRENT_PASSWORD',
    });
  }

  const hashedPassword = await hashPassword(result.data.newPassword);
  const updatedUser = changingPassword
    ? await userService.update({ id: userId, password: hashedPassword })
    : await userService.setInitialPassword(userId, user.password, hashedPassword);

  if (!updatedUser) {
    if (!changingPassword) {
      throw apiError({
        status: 409,
        statusText: 'Conflict',
        message: 'The account changed while setting its first password.',
        code: 'PASSWORD_SET_CONFLICT',
      });
    }
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
