import { isConstraintFailure } from '#layers/auth/server/utils/database/isConstraintFailure';
import { registerUserSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import userService from '#layers/auth/server/utils/database/user';
import userPasswordService from '#layers/auth-password/server/utils/database/userPassword';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
import { runPostRegisterSteps } from '#layers/auth-password/server/utils/postRegisterSteps';
import { safeRedirectPath } from '#layers/auth/server/utils/safeRedirect';
import type { User } from '#layers/auth/types/auth';

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

  // Reject existing accounts before spending CPU on a password hash.
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

  // The unique constraints also cover accounts created after the pre-check.
  let newUser: User;
  try {
    newUser = await userPasswordService.createUser(
      {
        username,
        email: result.data.email,
        name: result.data.name,
        emailVerified: false,
        isAdmin: false,
        onboardingPending: true,
      },
      password,
    );
  } catch (err: unknown) {
    const isDuplicate = (column: 'email' | 'username') =>
      isConstraintFailure(err, `UNIQUE constraint failed: users.${column}`);
    if (isDuplicate('email')) {
      return sendRedirect(event, passwordRoutes.AUTH_REGISTER + '?error=email-existed');
    }
    if (isDuplicate('username')) {
      return sendRedirect(event, passwordRoutes.AUTH_REGISTER + '?error=existed');
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
