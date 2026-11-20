import { userUpdateSchema } from '#layers/auth/shared/schemas/userSchema';
import userService from '#layers/auth/server/utils/database/user';
import { isConstraintFailure } from '#layers/auth/server/utils/database/isConstraintFailure';
import { emailAlreadyInUseError } from '#layers/auth/server/utils/emailAlreadyInUseError';
import { runEmailChangedHooks } from '#layers/auth/server/utils/emailChangedHooks';
import { normalizeEmail } from '#shared/utils/normalizeEmail';
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
  const result = await readValidatedBody(event, (body) => userUpdateSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The submitted user data is invalid.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const userNotFound = () => apiError({
    status: 404,
    statusText: 'Not Found',
    message: 'Not Found. The requested user does not exist.',
    code: 'USER_NOT_FOUND',
  });
  const currentUser = await userService.getById(userId);
  if (!currentUser) throw userNotFound();

  const { id: _id, email, emailVerified, password, ...fields } = result.data;
  const previousEmail = currentUser.email;
  const emailChanged = email !== undefined && email !== normalizeEmail(previousEmail);
  if (emailChanged) {
    const matches = await userService.listByEmail(email);
    if (matches.some((user) => user.id !== userId)) {
      throw emailAlreadyInUseError();
    }
  }

  const hashedPassword =
    typeof password === 'string' && password.trim().length > 0
      ? await hashPassword(password)
      : undefined;
  const changes = { ...fields, password: hashedPassword };
  const updatedUser = await (emailChanged
    ? userService.updateEmail(userId, email, changes)
    : userService.update({ ...changes, id: userId, email, emailVerified })
  ).catch((error: unknown) => {
    if (isConstraintFailure(error, 'UNIQUE constraint failed: users.email')) {
      throw emailAlreadyInUseError();
    }
    throw error;
  });

  if (!updatedUser) throw userNotFound();

  if (emailChanged) {
    await runEmailChangedHooks({ event, user: updatedUser, previousEmail });
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
