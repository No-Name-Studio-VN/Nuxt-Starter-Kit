import type { H3Event } from 'h3';
import type { RequestEvent } from 'nuxt/server';
import { deleteCookie, getCookie, sendRedirect } from 'nuxt/server';
import { safeRedirectPath } from '#layers/auth/server/utils/safeRedirect';
import type { OAuthLoginCompletionResult, OAuthProfile } from '#layers/auth/types/auth';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { isConstraintFailure } from '#layers/auth/server/utils/database/isConstraintFailure';
import userService from '#layers/auth/server/utils/database/user';
import oauthAccountService from '#layers/auth/server/utils/database/oauthAccount';
import { setCompletedSignIn } from '#layers/auth/server/utils/sessionUser';
import { runOAuthLinkPolicies } from '#layers/auth/server/utils/oauthLinkPolicies';
import { normalizeEmail } from '#shared/utils/normalizeEmail';

export type { OAuthLoginCompletionResult, OAuthProfile } from '#layers/auth/types/auth';

function getPopupRedirectTarget(event: RequestEvent, fallback: string, useRequestedRedirect: boolean) {
  if (getCookie(event, 'oauth_popup') !== '1') {
    return fallback;
  }

  const requestedRedirect = useRequestedRedirect ? getCookie(event, 'oauth_redirect_to') : undefined;
  return `/auth/oauth/popup?redirectTo=${encodeURIComponent(safeRedirectPath(event, requestedRedirect || fallback))}`;
}

function clearPopupOAuthCookies(event: RequestEvent) {
  deleteCookie(event, 'oauth_popup', { path: '/' });
  deleteCookie(event, 'oauth_redirect_to', { path: '/' });
}

export function sendOAuthRedirect(event: RequestEvent, fallback: string, useRequestedRedirect = true) {
  const target = getPopupRedirectTarget(event, fallback, useRequestedRedirect);
  clearPopupOAuthCookies(event);
  return sendRedirect(event, target);
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

/**
 * Handle successful authentication from an OAuth provider.
 * Manages account linking, sign-in, and account creation safely.
 */
export async function handleOAuthSuccess(event: RequestEvent, provider: string, profile: OAuthProfile) {
  const session = await getUserSession(event);
  const currentUser = session?.user;

  // ── MODE 1: Link Provider to existing logged-in account ──
  if (currentUser) {
    const currentUserId = currentUser.id;

    const alreadyConnected = `/settings/security?error=oauth-already-connected&provider=${provider}`;
    const alreadyLinked = `/settings/security?error=oauth-already-linked&provider=${provider}`;

    // Check if this provider account is already linked to someone
    const existingLink = await oauthAccountService.getByProviderAccount(provider, profile.id);
    if (existingLink) {
      return sendOAuthRedirect(event, existingLink.userId === currentUserId ? alreadyConnected : alreadyLinked);
    }

    // Check if user already has a different account for this provider linked
    const userProviderLink = await oauthAccountService.getByUserAndProvider(currentUserId, provider);
    if (userProviderLink) {
      return sendOAuthRedirect(event, alreadyConnected);
    }

    try {
      await oauthAccountService.link({
        userId: currentUserId,
        provider,
        providerAccountId: profile.id,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl ?? null,
      });
    } catch (error) {
      if (isConstraintFailure(error, 'UNIQUE constraint failed: oauth_accounts.user_id, oauth_accounts.provider')) {
        return sendOAuthRedirect(event, alreadyConnected);
      }
      if (isConstraintFailure(error, 'UNIQUE constraint failed: oauth_accounts.provider, oauth_accounts.provider_account_id')) {
        const winningLink = await oauthAccountService.getByProviderAccount(provider, profile.id);
        return sendOAuthRedirect(event, winningLink?.userId === currentUserId ? alreadyConnected : alreadyLinked);
      }
      throw error;
    }

    return sendOAuthRedirect(event, `/settings/security?success=oauth-linked&provider=${provider}`);
  }

  // ── MODE 2: Sign in or sign up (user is NOT logged in) ──

  const completion = await completeOAuthLogin(event, provider, profile);
  switch (completion.status) {
    case 'missing-user':
      return sendOAuthRedirect(event, `${authRoutes.AUTH_LOGIN}?error=unknown`, false);
    case 'refused':
      return sendOAuthRedirect(event, `${authRoutes.AUTH_LOGIN}?error=${completion.code}`, false);
    case 'created':
      return sendOAuthRedirect(event, authRoutes.ONBOARDING, false);
    case 'signed-in':
    case 'linked':
      return sendOAuthRedirect(event, '/');
  }
}

export async function completeOAuthLogin(
  event: H3Event | RequestEvent,
  provider: string,
  profile: OAuthProfile,
): Promise<OAuthLoginCompletionResult> {
  const link = {
    provider,
    providerAccountId: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl ?? null,
  };
  const linked = await oauthAccountService.getByProviderAccount(provider, profile.id);
  if (linked) {
    const dbUser = await userService.update({ id: linked.userId, lastLoginAt: new Date() });
    if (!dbUser) return { status: 'missing-user' };

    await oauthAccountService.updateDisplay(linked.id, link);
    await setCompletedSignIn(event, dbUser, { method: 'oauth', provider, avatarUrl: profile.avatarUrl });
    return { status: 'signed-in', userId: dbUser.id };
  }

  const email = normalizeEmail(profile.email);
  if (!email) return { status: 'refused', code: 'oauth-email-missing' };

  const emailTrusted = profile.emailVerified === true && profile.emailAuthoritative === true;
  const matches = await userService.listByEmail(email);
  const [matchedUser] = matches;
  if (matchedUser) {
    if (!emailTrusted || matches.length !== 1) {
      return { status: 'refused', code: 'oauth-email-in-use' };
    }
    if (await oauthAccountService.getByUserAndProvider(matchedUser.id, provider)) {
      return { status: 'refused', code: 'oauth-provider-conflict' };
    }
    if (!matchedUser.emailVerified || !(await runOAuthLinkPolicies({ user: matchedUser, provider }))) {
      return { status: 'refused', code: 'oauth-email-in-use' };
    }

    try {
      await oauthAccountService.linkVerifiedEmail(matchedUser, link);
    } catch (error) {
      if (isConstraintFailure(error, 'UNIQUE constraint failed: oauth_accounts.user_id, oauth_accounts.provider')) {
        return { status: 'refused', code: 'oauth-provider-conflict' };
      }
      if (isConstraintFailure(error, 'NOT NULL constraint failed: oauth_accounts.user_id') ||
          isConstraintFailure(error, 'UNIQUE constraint failed: oauth_accounts.provider, oauth_accounts.provider_account_id')) {
        return { status: 'refused', code: 'oauth-email-in-use' };
      }
      throw error;
    }

    const dbUser = await userService.update({ id: matchedUser.id, lastLoginAt: new Date() });
    if (!dbUser) return { status: 'missing-user' };

    await setCompletedSignIn(event, dbUser, { method: 'oauth', provider, avatarUrl: profile.avatarUrl });
    return { status: 'linked', userId: dbUser.id };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const username = await generateUniqueUsername(email);
    let newUser: Awaited<ReturnType<typeof oauthAccountService.createUserWithLink>>;
    try {
      newUser = await oauthAccountService.createUserWithLink({
        username,
        name: profile.name || username,
        email,
        password: '',
        emailVerified: emailTrusted,
        isAdmin: false,
        onboardingPending: true,
      }, link);
    } catch (error) {
      if (isConstraintFailure(error, 'UNIQUE constraint failed: users.username')) continue;
      if (isConstraintFailure(error, 'UNIQUE constraint failed: users.email') ||
          isConstraintFailure(error, 'UNIQUE constraint failed: oauth_accounts.provider, oauth_accounts.provider_account_id')) {
        return { status: 'refused', code: 'oauth-email-in-use' };
      }
      throw error;
    }

    if (!newUser) return { status: 'missing-user' };

    await setCompletedSignIn(event, newUser, { method: 'oauth', provider, avatarUrl: profile.avatarUrl });
    return { status: 'created', userId: newUser.id };
  }

  return { status: 'refused', code: 'oauth-email-in-use' };
}
