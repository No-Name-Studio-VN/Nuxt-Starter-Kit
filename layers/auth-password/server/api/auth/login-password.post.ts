import userService from '#layers/auth/server/utils/database/user';
import userPasswordService from '#layers/auth-password/server/utils/database/userPassword';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { loginSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import { completeSignIn } from '#layers/auth/server/utils/completeSignIn';
import { loginErrorPath } from '#layers/auth/server/utils/loginErrorPath';
import { safeRedirectPath } from '#layers/auth/server/utils/safeRedirect';

export default defineEventHandler(async (event) => {
  let originalUsername: string | undefined;
  const result = await readValidatedBody(event, (body) => {
    if (body && typeof body === 'object' && 'username' in body && typeof body.username === 'string') {
      originalUsername = body.username;
    }
    return loginSchema.safeParse(body);
  });
  if (!result.success) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=validation');
  }

  const { username, password } = result.data;
  const redirectToStr = safeRedirectPath(event, result.data['redirect-to']);

  // Find user by username
  const user = await userService.getByUsername(username) ??
    (originalUsername && originalUsername !== username ? await userService.getByUsername(originalUsername) : undefined);
  if (!user) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=invalid-credentials');
  }

  if (!(await userPasswordService.verify(user.id, password))) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=invalid-credentials');
  }

  // Installed layers can register policies before auth's account lock check
  // (150), and the second factor runs at 200 when auth-2fa is installed.
  const outcome = await completeSignIn(event, user, {
    method: 'password',
    redirectTo: redirectToStr,
  });
  if (outcome.kind === 'respond') {
    return outcome.respond();
  }
  // The form posts natively, so a refusal goes back to the login page as `?error=`.
  if (outcome.kind === 'deny') {
    return sendRedirect(event, loginErrorPath(outcome.error, 'unknown'));
  }

  return sendRedirect(event, redirectToStr);
});
