import { and, eq } from 'drizzle-orm';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { readValidatedRequestBody } from '#layers/server-core/server/utils/requestBody';
import { hasOtherSignInMethod } from '#layers/auth/server/utils/signInMethods';
import type { DeletePasskeyResponse } from '#layers/auth-passkeys/types/models/passkey';
import { deletePasskeySchema } from '#layers/auth-passkeys/shared/schemas/passkeySchema';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const sessionUser = session.user;
  const db = useDB();

  const result = await readValidatedRequestBody(event, deletePasskeySchema.safeParse);

  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Please fix the highlighted fields.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const { credentialId } = result.data;

  const { credentials } = tables;
  const ownedCredential = and(eq(credentials.id, credentialId), eq(credentials.userId, sessionUser.id));
  const deleted = await db.delete(credentials).where(and(
    ownedCredential,
    hasOtherSignInMethod(sessionUser.id, { methodId: 'passkey', credentialId }),
  )).returning({ id: credentials.id }).get();

  if (!deleted) {
    const credential = await db.select({ id: credentials.id }).from(credentials).where(ownedCredential).get();
    if (!credential) {
      throw apiError({
        status: 404,
        statusText: 'Not Found',
        message: 'Not Found. The specified passkey was not found or does not belong to this account.',
        code: 'PASSKEY_NOT_FOUND',
      });
    }

    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Add another sign-in method before removing your last passkey.',
      code: 'ONLY_SIGNIN_METHOD',
    });
  }

  const response: DeletePasskeyResponse = {
    message: 'Passkey deleted successfully',
  };
  return success(response);
});
