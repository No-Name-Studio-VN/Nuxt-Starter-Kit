import type { H3Event } from 'h3';
import type {
  OAuthLoginCompletionResult,
  OAuthSignInEvidence,
} from '#layers/auth-oauth/types/oauth';
import type { OAuthProfile, OAuthProviderId } from '#layers/auth-oauth/types/providers';
import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import userService from '#layers/auth/server/utils/database/user';
import oauthAccountService from '#layers/auth-oauth/server/utils/database/oauthAccount';
import { completeSignIn } from '#layers/auth/server/utils/completeSignIn';
import { safeRedirectPath } from '#layers/auth/server/utils/safeRedirect';
import { loginErrorPath } from '#layers/auth/server/utils/loginErrorPath';

export function rememberOAuthRequest(event: H3Event) {
  const { popup, redirectTo, code, error } = getQuery(event);
  if (code || error) return;

  const options = {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 600,
  } satisfies Parameters<typeof setCookie>[3];
  if (popup === '1') {
    setCookie(event, 'oauth_popup', '1', options);
  } else {
    deleteCookie(event, 'oauth_popup', { path: '/' });
  }

  if (typeof redirectTo === 'string') {
    setCookie(event, 'oauth_redirect_to', safeRedirectPath(event, redirectTo), options);
  } else {
    deleteCookie(event, 'oauth_redirect_to', { path: '/' });
  }
}

function getOAuthRedirectTo(event: H3Event) {
  return safeRedirectPath(event, getCookie(event, 'oauth_redirect_to'));
}

export function sendOAuthRedirect(event: H3Event, path: string) {
  const target = safeRedirectPath(event, path);
  const popup = getCookie(event, 'oauth_popup') === '1';
  deleteCookie(event, 'oauth_popup', { path: '/' });
  deleteCookie(event, 'oauth_redirect_to', { path: '/' });
  return sendRedirect(
    event,
    popup ? `${oauthRoutes.POPUP}?redirectTo=${encodeURIComponent(target)}` : target,
  );
}

function sendLinkRedirect(
  event: H3Event,
  provider: OAuthProviderId,
  feedback: 'error' | 'success',
  code: string,
) {
  const target = new URL(getOAuthRedirectTo(event), getRequestURL(event).origin);
  target.searchParams.set(feedback, code);
  target.searchParams.set('provider', provider);
  return sendOAuthRedirect(event, target.href);
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
  event: H3Event,
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

    await oauthAccountService.link({
      userId: currentUserId,
      provider,
      providerAccountId: profile.providerAccountId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl ?? null,
    });

    return sendLinkRedirect(event, provider, 'success', 'oauth-linked');
  }

  const completion = await completeOAuthLogin(event, provider, profile);
  if (completion.status === 'missing-user') {
    return sendOAuthRedirect(event, `${authRoutes.AUTH_LOGIN}?error=unknown`);
  }

  const { outcome } = completion;
  // A policy that answers the request itself has started its response already
  // (a redirect, as the password policies do); the OAuth handler only waits for it.
  if (outcome.kind === 'respond') {
    await outcome.body;
    return;
  }
  if (outcome.kind === 'deny') {
    return sendOAuthRedirect(event, loginErrorPath(outcome.error, 'oauth-error'));
  }

  return sendOAuthRedirect(event, getOAuthRedirectTo(event));
}

export async function completeOAuthLogin(
  event: H3Event,
  provider: OAuthProviderId,
  profile: OAuthProfile,
): Promise<OAuthLoginCompletionResult> {
  const oauth: OAuthSignInEvidence = {
    provider,
    providerAccountId: profile.providerAccountId,
    email: profile.email,
  };
  const linked = await oauthAccountService.getByProviderAccount(
    provider,
    profile.providerAccountId,
  );

  if (linked) {
    const dbUser = await userService.getById(linked.userId);
    if (!dbUser) {
      return { status: 'missing-user' };
    }

    const outcome = await completeSignIn(event, dbUser, {
      method: 'oauth',
      redirectTo: getOAuthRedirectTo(event),
      oauth,
    });
    return { status: 'signed-in', userId: dbUser.id, outcome };
  }

  const username = await generateUniqueUsername(profile.email);

  const newUser = await userService.create({
    username,
    name: profile.name || username,
    email: profile.email,
    emailVerified: true,
    isAdmin: false,
  });

  await oauthAccountService.link({
    userId: newUser.id,
    provider,
    providerAccountId: profile.providerAccountId,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl ?? null,
  });

  const outcome = await completeSignIn(event, newUser, {
    method: 'oauth',
    redirectTo: getOAuthRedirectTo(event),
    oauth,
  });
  return { status: 'created', userId: newUser.id, outcome };
}
