import { changePasswordSchema, setPasswordSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import userService from '#layers/auth/server/utils/database/user';
import userPasswordService from '#layers/auth-password/server/utils/database/userPassword';
import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import type { PasswordUpdatePayload } from '#layers/auth-password/types/userSecurity';

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

  const changingPassword = await userPasswordService.hasPassword(userId);
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
    typeof currentPassword !== 'string' || !(await userPasswordService.verify(userId, currentPassword))
  )) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. The current password provided is incorrect.',
      code: 'INVALID_CURRENT_PASSWORD',
    });
  }

  if (changingPassword) {
    await userPasswordService.set(userId, result.data.newPassword);
  } else if (!(await userPasswordService.setInitial(userId, result.data.newPassword))) {
    throw apiError({
      status: 409,
      statusText: 'Conflict',
      message: 'The account changed while setting its first password.',
      code: 'PASSWORD_SET_CONFLICT',
    });
  }

  const response: PasswordUpdatePayload = { message: 'Password updated successfully' };
  return success(response);
});
