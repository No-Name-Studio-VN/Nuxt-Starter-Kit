import { eq, and } from 'drizzle-orm';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { assertCanRemoveCredential } from '#layers/auth/server/utils/signInMethods';
import type { DeletePasskeyResponse } from '#layers/auth-passkeys/types/models/passkey';
import { deletePasskeySchema } from '#layers/auth-passkeys/shared/schemas/passkeySchema';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const sessionUser = session.user;
  const db = useDB();

  // Parse and validate request body
  const body = await readBody(event);
  const result = deletePasskeySchema.safeParse(body);

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

  // Check if the credential belongs to the current user
  const credential = await db
    .select()
    .from(tables.credentials)
    .where(
      and(eq(tables.credentials.id, credentialId), eq(tables.credentials.userId, sessionUser.id)),
    )
    .get();

  if (!credential) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. The specified passkey was not found or does not belong to this account.',
      code: 'PASSKEY_NOT_FOUND',
    });
  }

  await assertCanRemoveCredential(sessionUser.id);

  await db
    .delete(tables.credentials)
    .where(
      and(eq(tables.credentials.id, credentialId), eq(tables.credentials.userId, sessionUser.id)),
    );

  const response: DeletePasskeyResponse = {
    message: 'Passkey deleted successfully',
  };
  return success(response);
});
