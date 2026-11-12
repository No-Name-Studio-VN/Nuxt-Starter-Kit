import { createUserSchema } from '#layers/auth/shared/schemas/userSchema';
import userService from '#layers/auth/server/utils/database/user';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import type { AdminUserModel } from '#layers/auth/types/models/profile';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => createUserSchema.safeParse(body));
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

  const { password } = result.data;
  const hashedPassword = await hashPassword(password);

  const newUser = await userService.create({
    ...result.data,
    password: hashedPassword,
  });

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
