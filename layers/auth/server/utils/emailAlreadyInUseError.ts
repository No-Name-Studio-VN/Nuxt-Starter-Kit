import { apiError } from '#layers/server-core/server/utils/apiResponse';

export function emailAlreadyInUseError() {
  return apiError({
    status: 409,
    statusText: 'Conflict',
    code: 'EMAIL_ALREADY_IN_USE',
    message: 'This email address is already associated with another account.',
  });
}
