import userService from '#layers/auth/server/utils/database/user';
// <nsk:auth-email-verification>
import { apiRoutes } from '#shared/apiRoutes';
// </nsk:auth-email-verification>
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { loginSchema } from '#layers/auth/shared/schemas/userSchema';
import { runLoginPolicies } from '#layers/auth/server/utils/loginPolicies';
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

  // <nsk:auth-email-verification>
  // Check email verification
  if (!user.emailVerified) {
    return sendRedirect(
      event,
      apiRoutes.AUTH_VERIFY_EMAIL +
        '?email=' +
        encodeURIComponent(user.email) +
        '&redirectTo=' +
        encodeURIComponent(redirectToStr),
    );
  }
  // </nsk:auth-email-verification>

  // Registered login policies run here: auth's account lock check, which also
  // records the login (order 150), and the second factor when auth-2fa is
  // installed (200). The email verification block above (100) becomes a policy
  // in a later task.
  const policyOutcome = await runLoginPolicies({ event, user, redirectTo: redirectToStr });
  if (policyOutcome.kind !== 'continue') {
    if (policyOutcome.kind === 'respond') {
      return policyOutcome.body;
    }
    if (policyOutcome.kind === 'deny') {
      throw apiError(policyOutcome.error);
    }

    // Fail closed: an outcome no branch above understands never signs the user in.
    throw apiError({
      status: 500,
      statusText: 'Internal Server Error',
      message: 'Internal Server Error. The sign-in could not be completed.',
      code: 'LOGIN_POLICY_UNKNOWN_OUTCOME',
    });
  }

  // Update last login
  await userService.update({ id: user.id, lastLoginAt: new Date() });

  // The login policy allowed a direct sign-in (no second factor required)
  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      isAdmin: user.isAdmin,
      skipLockOnInit: true, // Bypass lock screen initial check on fresh login
    },
  });

  return sendRedirect(event, redirectToStr);
});
