import { adminUserCreateSchema } from '#layers/admin-users/shared/schemas/adminUserSchema';
import userService from '#layers/auth/server/utils/database/user';
import { getSignInMethod } from '#layers/auth/server/utils/signInMethods';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import type { AdminUserModel } from '#layers/admin-users/types/adminUsers';

export default defineEventHandler(async (event) => {
  // A new account's only way in is the password set here.
  const passwordMethod = getSignInMethod('password');
  if (!passwordMethod?.setSecret) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. Creating users needs password sign-in, which is not installed.',
      code: 'PASSWORD_SIGN_IN_NOT_INSTALLED',
    });
  }

  const result = await readValidatedBody(event, (body) => adminUserCreateSchema.safeParse(body));
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

  const { password, ...userData } = result.data;
  const newUser = await userService.create(userData);
  try {
    await passwordMethod.setSecret(newUser.id, password);
  } catch (err: unknown) {
    await userService.delete(newUser.id);
    throw err;
  }

  const response: AdminUserModel = {
    id: newUser.id,
    username: newUser.username,
    name: newUser.name,
    email: newUser.email,
    isAdmin: newUser.isAdmin,
    isLocked: newUser.isLocked,
    emailVerified: newUser.emailVerified,
  };

  return success(response);
});
