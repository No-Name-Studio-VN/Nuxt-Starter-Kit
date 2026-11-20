import { deleteCookie as deleteNuxtCookie, getCookie as getNuxtCookie, getQuery, sendRedirect, setCookie } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';
import type { H3Event } from 'h3';
import type { OAuthLinkRefusalCode, OAuthLoginCompletionResult, OAuthSignInEvidence } from '#layers/auth-oauth/types/oauth';
import type { OAuthProfile, OAuthProviderId } from '#layers/auth-oauth/types/providers';
import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import userService from '#layers/auth/server/utils/database/user';
import oauthAccountService from '#layers/auth-oauth/server/utils/database/oauthAccount';
import { completeSignIn } from '#layers/auth/server/utils/completeSignIn';
import { safeRedirectPath } from '#layers/auth/server/utils/safeRedirect';
import { loginErrorPath } from '#layers/auth/server/utils/loginErrorPath';
import { isConstraintFailure } from '#layers/auth/server/utils/database/isConstraintFailure';
import { runOAuthLinkPolicies } from '#layers/auth/server/utils/oauthLinkPolicies';

const userProviderConflict = 'UNIQUE constraint failed: oauth_accounts.user_id, oauth_accounts.provider';
const identityConflict = 'UNIQUE constraint failed: oauth_accounts.provider, oauth_accounts.provider_account_id';

class OAuthLinkRefusal extends Error {
  constructor(readonly code: OAuthLinkRefusalCode) {
    super(code);
  }
}

export function rememberOAuthRequest(event: RequestEvent) {
  const { popup, redirectTo } = getQuery(event);

  const options = {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 600,
  } satisfies Parameters<typeof setCookie>[3];
  if (popup === '1') {
    setCookie(event, 'oauth_popup', '1', options);
  } else {
    deleteNuxtCookie(event, 'oauth_popup', { path: '/' });
  }

  if (typeof redirectTo === 'string') {
    setCookie(event, 'oauth_redirect_to', safeRedirectPath(event, redirectTo), options);
  } else {
    deleteNuxtCookie(event, 'oauth_redirect_to', { path: '/' });
  }
}

function getOAuthRedirectTo(event: H3Event | RequestEvent) {
  const redirect = 'url' in event ? getNuxtCookie(event, 'oauth_redirect_to') : getCookie(event, 'oauth_redirect_to');
  return safeRedirectPath(event, redirect);
}

export function clearOAuthRequest(event: H3Event | RequestEvent) {
  for (const name of ['oauth_popup', 'oauth_redirect_to']) {
    if ('url' in event) deleteNuxtCookie(event, name, { path: '/' });
    else deleteCookie(event, name, { path: '/' });
  }
}

export function sendOAuthRedirect(event: RequestEvent, path: string) {
  const target = safeRedirectPath(event, path);
  const popup = getNuxtCookie(event, 'oauth_popup') === '1';
  clearOAuthRequest(event);
  return sendRedirect(
    event,
    popup ? `${oauthRoutes.POPUP}?redirectTo=${encodeURIComponent(target)}` : target,
  );
}

function sendLinkRedirect(
  event: RequestEvent,
  provider: OAuthProviderId,
  feedback: 'error' | 'success',
  code: string,
) {
  const requested = getOAuthRedirectTo(event);
  const target = new URL(requested, event.url.origin);
  target.searchParams.set(feedback, code);
  target.searchParams.set('provider', provider);
  return sendOAuthRedirect(event, `${target.pathname}${target.search}${target.hash}`);
}

/**
 * Generate a valid username from a provider email address.
 * Strips the domain, converts to lowercase, replaces invalid chars, and truncates.
 * If username is taken, appends a random suffix.
 */
async function generateUniqueUsername(email: string): Promise<string> {
  const handle = email.split('@')[0] || 'user';

  let base = handle
    .toLowerCase()
    .replace(/\./g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);

  if (base.length < 3) {
    base = `user-${base}`;
  }

  let username = base;
  let existing = await userService.getByUsername(username);

  if (!existing) return username;

  for (let i = 0; i < 10; i++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    username = `${base}-${suffix}`.slice(0, 50);
    existing = await userService.getByUsername(username);
    if (!existing) return username;
  }

  return `${base}-${Date.now().toString(36)}`.slice(0, 50);
}

export async function handleOAuthSuccess(
  event: RequestEvent,
  provider: OAuthProviderId,
  profile: OAuthProfile,
) {
  const session = await getUserSession(event);
  const currentUser = session?.user;

  if (currentUser) {
    const currentUserId = currentUser.id;

    const existingLink = await oauthAccountService.getByProviderAccount(
      provider,
      profile.providerAccountId,
    );
    if (existingLink) {
      if (existingLink.userId === currentUserId) {
        return sendLinkRedirect(event, provider, 'error', 'oauth-already-connected');
      }
      return sendLinkRedirect(event, provider, 'error', 'oauth-already-linked');
    }

    const userProviderLink = await oauthAccountService.getByUserAndProvider(
      currentUserId,
      provider,
    );
    if (userProviderLink) {
      return sendLinkRedirect(event, provider, 'error', 'oauth-already-connected');
    }

    try {
      await oauthAccountService.link({
        userId: currentUserId,
        provider,
        providerAccountId: profile.providerAccountId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl ?? null,
      });
    } catch (error) {
      if (isConstraintFailure(error, userProviderConflict)) {
        return sendLinkRedirect(event, provider, 'error', 'oauth-already-connected');
      }
      if (isConstraintFailure(error, identityConflict)) {
        const winner = await oauthAccountService.getByProviderAccount(provider, profile.providerAccountId);
        const code = winner?.userId === currentUserId ? 'oauth-already-connected' : 'oauth-already-linked';
        return sendLinkRedirect(event, provider, 'error', code);
      }
      throw error;
    }

    return sendLinkRedirect(event, provider, 'success', 'oauth-linked');
  }

  const completion = await completeOAuthLogin(event, provider, profile);
  if (completion.status === 'missing-user') {
    return sendOAuthRedirect(event, `${authRoutes.AUTH_LOGIN}?error=unknown`);
  }

  if (completion.status === 'refused') {
    return sendOAuthRedirect(event, `${authRoutes.AUTH_LOGIN}?error=${completion.code}`);
  }

  const { outcome } = completion;
  if (outcome.kind === 'respond') {
    return sendOAuthRedirect(event, `${authRoutes.AUTH_LOGIN}?error=sign-in-step-required`);
  }
  if (outcome.kind === 'deny') {
    return sendOAuthRedirect(event, loginErrorPath(outcome.error, 'oauth-error'));
  }

  return sendOAuthRedirect(event, completion.status === 'created' ? authRoutes.ONBOARDING : getOAuthRedirectTo(event));
}

export async function completeOAuthLogin(
  event: H3Event | RequestEvent,
  provider: OAuthProviderId,
  profile: OAuthProfile,
): Promise<OAuthLoginCompletionResult> {
  const link = {
    provider,
    providerAccountId: profile.providerAccountId,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl ?? null,
  };
  const oauth: OAuthSignInEvidence = link;
  const options = { method: 'oauth', redirectTo: getOAuthRedirectTo(event), oauth };

  const linked = await oauthAccountService.getByProviderAccount(provider, profile.providerAccountId);
  if (linked) {
    const user = await userService.getById(linked.userId);
    if (!user) return { status: 'missing-user' };

    const outcome = await completeSignIn(event, user, {
      ...options,
      beforeFinish: () => oauthAccountService.updateDisplay(linked.id, link),
    });
    return { status: 'signed-in', userId: user.id, outcome };
  }

  const { email } = profile;
  if (!email) return { status: 'refused', code: 'oauth-email-missing' };

  const trusted = profile.emailVerified && profile.emailAuthoritative;
  const matches = await userService.listByEmail(email);
  const [matchedUser] = matches;
  if (matchedUser) {
    if (!trusted || matches.length !== 1) {
      return { status: 'refused', code: 'oauth-email-in-use' };
    }
    if (await oauthAccountService.getByUserAndProvider(matchedUser.id, provider)) {
      return { status: 'refused', code: 'oauth-provider-conflict' };
    }
    if (!matchedUser.emailVerified || !(await runOAuthLinkPolicies({ user: matchedUser, provider }))) {
      return { status: 'refused', code: 'oauth-email-in-use' };
    }

    try {
      const outcome = await completeSignIn(event, matchedUser, {
        ...options,
        async beforeFinish() {
          try {
            await oauthAccountService.linkVerifiedEmail(matchedUser, link);
          } catch (error) {
            if (isConstraintFailure(error, userProviderConflict)) {
              throw new OAuthLinkRefusal('oauth-provider-conflict');
            }
            if (isConstraintFailure(error, identityConflict) ||
                isConstraintFailure(error, 'NOT NULL constraint failed: oauth_accounts.user_id')) {
              throw new OAuthLinkRefusal('oauth-email-in-use');
            }
            throw error;
          }
        },
      });
      return { status: 'linked', userId: matchedUser.id, outcome };
    } catch (error) {
      if (error instanceof OAuthLinkRefusal) return { status: 'refused', code: error.code };
      throw error;
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const username = await generateUniqueUsername(email);
    let user: Awaited<ReturnType<typeof oauthAccountService.createUserWithLink>>;
    try {
      user = await oauthAccountService.createUserWithLink({
        username,
        name: profile.name || username,
        email,
        emailVerified: provider === 'oidc' ? profile.emailVerified : trusted,
        isAdmin: false,
        onboardingPending: true,
      }, link);
    } catch (error) {
      if (isConstraintFailure(error, 'UNIQUE constraint failed: users.username')) continue;
      if (isConstraintFailure(error, 'UNIQUE constraint failed: users.email') ||
          isConstraintFailure(error, identityConflict)) {
        return { status: 'refused', code: 'oauth-email-in-use' };
      }
      throw error;
    }

    if (!user) return { status: 'missing-user' };
    const outcome = await completeSignIn(event, user, options);
    return { status: 'created', userId: user.id, outcome };
  }

  return { status: 'refused', code: 'oauth-email-in-use' };
}
