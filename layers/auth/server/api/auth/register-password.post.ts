import { registerUserSchema } from '#layers/auth/shared/schemas/userSchema';
import userService from '#layers/auth/server/utils/database/user';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { runPostRegisterSteps } from '#layers/auth/server/utils/postRegisterSteps';
import type { User } from '#layers/auth/types/auth';
import type { RegisterUserInput } from '#layers/auth/shared/schemas/userSchema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function safeRedirectPath(value: string | undefined, origin: string): string {
  if (!value) {
    return '/';
  }

  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) {
      return '/';
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => registerUserSchema.safeParse(body));
  if (!result.success) {
    return sendRedirect(event, authRoutes.AUTH_REGISTER + '?error=validation');
  }

  const { username, password, 'cf-turnstile-response': token } = result.data;

  const tokenValidation = await verifyTurnstileToken(token);
  if (!tokenValidation.success) {
    return sendRedirect(event, authRoutes.AUTH_REGISTER + '?error=captcha');
  }

  const redirectTo = safeRedirectPath(result.data['redirect-to'], getRequestURL(event).origin);

  // 1. CHEAP PRE-CHECK: Prevent CPU Exhaustion (DoS) by checking constraints before hashing
  const [existingUsername, existingEmail] = await Promise.all([
    userService.getByUsername(username),
    userService.getByEmail(result.data.email),
  ]);

  if (existingUsername) {
    return sendRedirect(event, authRoutes.AUTH_REGISTER + '?error=existed');
  }
  if (existingEmail) {
    return sendRedirect(event, authRoutes.AUTH_REGISTER + '?error=email-existed');
  }

  // 2. EXPENSIVE OPERATION: Hash only when pre-checks pass
  const hashedPassword = await hashPassword(password);

  // 3. ATOMIC INSERT: Protect against Time-Of-Check to Time-Of-Use (TOCTOU) race conditions
  let newUser: User;
  try {
    const createPayload: Pick<RegisterUserInput, 'username' | 'email' | 'name'> & {
      password: string;
      emailVerified: boolean;
      isAdmin: boolean;
    } = {
      username: result.data.username,
      email: result.data.email,
      name: result.data.name,
      password: hashedPassword,
      emailVerified: false,
      isAdmin: false,
    };

    newUser = await userService.create({
      ...createPayload,
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
        return sendRedirect(event, authRoutes.AUTH_REGISTER + '?error=email-existed');
      }
      return sendRedirect(event, authRoutes.AUTH_REGISTER + '?error=existed');
    }
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
