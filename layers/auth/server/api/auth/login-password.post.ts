import userService from '#layers/auth/server/utils/database/user';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { loginSchema } from '#layers/auth/shared/schemas/userSchema';
import { completeSignIn } from '#layers/auth/server/utils/completeSignIn';
import { apiError } from '#layers/server-core/server/utils/apiResponse';

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
  const result = await readValidatedBody(event, (body) => loginSchema.safeParse(body));
  if (!result.success) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=validation');
  }

  const { username, password, 'cf-turnstile-response': token } = result.data;
  const redirectToStr = safeRedirectPath(result.data['redirect-to'], getRequestURL(event).origin);

  if (!token) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=captcha');
  }

  const tokenValidation = await verifyTurnstileToken(token);
  if (!tokenValidation.success) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=captcha');
  }

  // Find user by username
  const user = await userService.getByUsername(username);
  if (!user) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=invalid-credentials');
  }

  // Verify password using nuxt-auth-utils
  const isValidPassword = await verifyPassword(user.password, password);

  if (!isValidPassword) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=invalid-credentials');
  }

  // Installed layers can register policies before auth's account lock check
  // (150), and the second factor runs at 200 when auth-2fa is installed.
  const outcome = await completeSignIn(event, user, {
    method: 'password',
    redirectTo: redirectToStr,
  });
  if (outcome.kind === 'respond') {
    return outcome.body;
  }
  if (outcome.kind === 'deny') {
    throw apiError(outcome.error);
  }

  return sendRedirect(event, redirectToStr);
});
