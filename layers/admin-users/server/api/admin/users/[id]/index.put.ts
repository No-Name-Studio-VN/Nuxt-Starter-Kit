import { adminUserUpdateSchema } from '#layers/admin-users/shared/schemas/adminUserSchema';
import userService from '#layers/auth/server/utils/database/user';
import { getSignInMethod } from '#layers/auth/server/utils/signInMethods';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import type { AdminUserModel } from '#layers/admin-users/types/adminUsers';

export default defineEventHandler(async (event) => {
  const userId = Number(getRouterParam(event, 'id'));
  if (Number.isNaN(userId)) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The provided user ID is not a valid number.',
      code: 'INVALID_USER_ID',
    });
  }
  const result = await readValidatedBody(event, (body) => adminUserUpdateSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The submitted user data is invalid.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const { password, ...validatedData } = result.data;
  const newPassword = password.trim().length > 0 ? password : undefined;
  const passwordMethod = getSignInMethod('password');
  if (newPassword && !passwordMethod?.updateWithSecret) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Setting a password needs password sign-in, which is not installed.',
      code: 'PASSWORD_SIGN_IN_NOT_INSTALLED',
    });
  }

  const userData = { ...validatedData, id: userId };
  const updatedUser =
    newPassword && passwordMethod?.updateWithSecret
      ? await passwordMethod.updateWithSecret(userData, newPassword)
      : await userService.update(userData);
  if (!updatedUser) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. The requested user does not exist.',
      code: 'USER_NOT_FOUND',
    });
  }

  const user: AdminUserModel = {
    id: updatedUser.id,
    username: updatedUser.username,
    name: updatedUser.name,
    email: updatedUser.email,
    isAdmin: updatedUser.isAdmin,
    isLocked: updatedUser.isLocked,
    emailVerified: updatedUser.emailVerified,
  };

  return success({ user });
});
