import { registerUserSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import userService from '#layers/auth/server/utils/database/user';
import userPasswordService from '#layers/auth-password/server/utils/database/userPassword';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
import { runPostRegisterSteps } from '#layers/auth-password/server/utils/postRegisterSteps';
import { safeRedirectPath } from '#layers/auth/server/utils/safeRedirect';
import type { User } from '#layers/auth/types/auth';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => registerUserSchema.safeParse(body));
  if (!result.success) {
    return sendRedirect(event, passwordRoutes.AUTH_REGISTER + '?error=validation');
  }

  const { username, password, 'cf-turnstile-response': token } = result.data;

  const tokenValidation = await verifyTurnstileToken(token);
  if (!tokenValidation.success) {
    return sendRedirect(event, passwordRoutes.AUTH_REGISTER + '?error=captcha');
  }

  const redirectTo = safeRedirectPath(event, result.data['redirect-to']);

  // 1. CHEAP PRE-CHECK: Prevent CPU Exhaustion (DoS) by checking constraints before hashing
  const [existingUsername, existingEmail] = await Promise.all([
    userService.getByUsername(username),
    userService.getByEmail(result.data.email),
  ]);

  if (existingUsername) {
    return sendRedirect(event, passwordRoutes.AUTH_REGISTER + '?error=existed');
  }
  if (existingEmail) {
    return sendRedirect(event, passwordRoutes.AUTH_REGISTER + '?error=email-existed');
  }

  // 2. ATOMIC INSERT: Protect against Time-Of-Check to Time-Of-Use (TOCTOU) race conditions
  let newUser: User;
  try {
    newUser = await userService.create({
      username: result.data.username,
      email: result.data.email,
      name: result.data.name,
      emailVerified: false,
      isAdmin: false,
    });
  } catch (err: unknown) {
    let maybeErrCode: string | undefined;
    let maybeErrMessage: string | undefined;
    let maybeErrCauseMessage: string | undefined;

    if (isRecord(err)) {
      const errorRecord = err;
      if (typeof errorRecord.code === 'string') {
        maybeErrCode = errorRecord.code;
      }
      if (typeof errorRecord.message === 'string') {
        maybeErrMessage = errorRecord.message;
      }
      if (isRecord(errorRecord.cause)) {
        const causeRecord = errorRecord.cause;
        if (typeof causeRecord.message === 'string') {
          maybeErrCauseMessage = causeRecord.message;
        }
      }
    }
    // Fallback for strict concurrency races relying on standard SQLite constraint codes
    const isUniqueConstraint =
      maybeErrCode === 'SQLITE_CONSTRAINT' ||
      maybeErrCode === 'SQLITE_CONSTRAINT_UNIQUE' ||
      maybeErrMessage?.includes('UNIQUE');
    if (isUniqueConstraint) {
      if (maybeErrMessage?.includes('email') || maybeErrCauseMessage?.includes('email')) {
        return sendRedirect(event, passwordRoutes.AUTH_REGISTER + '?error=email-existed');
      }
      return sendRedirect(event, passwordRoutes.AUTH_REGISTER + '?error=existed');
    }
    throw err;
  }

  // 3. EXPENSIVE OPERATION: Hash only once the account exists. Without its
  // password the account has no way in, so a failure removes it again.
  try {
    await userPasswordService.set(newUser.id, password);
  } catch (err: unknown) {
    await userService.delete(newUser.id);
    throw err;
  }

  // Installed layers can run post-registration work and choose a redirect.
  // Without a step redirect, registration goes to sign-in.
  const postRegister = await runPostRegisterSteps({ event, user: newUser, redirectTo });

  return sendRedirect(
    event,
    postRegister.redirect ??
      authRoutes.AUTH_LOGIN + '?redirectTo=' + encodeURIComponent(redirectTo),
  );
});
