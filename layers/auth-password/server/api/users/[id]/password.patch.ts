import { changePasswordSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
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

  // An account without a password has no current password to prove.
  if (!(await userPasswordService.verify(userId, result.data.currentPassword))) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. The current password provided is incorrect.',
      code: 'INVALID_CURRENT_PASSWORD',
    });
  }

  await userPasswordService.set(userId, result.data.newPassword);

  const response: PasswordUpdatePayload = { message: 'Password updated successfully' };
  return success(response);
});
