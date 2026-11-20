import type { RequestEvent } from 'nuxt/server';
import { describe, expect, it } from 'vitest';
import { sendOAuthRedirect } from '../../../layers/auth/server/utils/oauth';
import { safeRedirectPath } from '../../../layers/auth/server/utils/safeRedirect';

function createOAuthEvent(cookie: string): RequestEvent {
  const url = new URL('http://example.com/api/auth/google');
  return {
    url,
    req: new Request(url, { headers: { cookie, 'x-forwarded-proto': 'https' } }),
    res: { headers: new Headers() },
    context: {},
  };
}

describe('server redirect paths', () => {
  it('uses the forwarded protocol when validating the public origin', () => {
    const event = createOAuthEvent('');
    expect(safeRedirectPath(event, 'https://example.com/account?tab=security#details', '/fallback'))
      .toBe('/account?tab=security#details');
    expect(safeRedirectPath(event, 'https://other.example/account', '/fallback')).toBe('/fallback');
    const sameOriginURL = new URL('https://example.com');
    sameOriginURL.pathname = '//account';
    expect(safeRedirectPath(event, sameOriginURL.href, '/fallback')).toBe('/fallback');
    expect(safeRedirectPath(event, undefined, '/fallback')).toBe('/fallback');
  });
});

describe('OAuth redirects', () => {
  it('redirects a popup to the same public origin and expires both popup cookies', () => {
    const event = createOAuthEvent(
      'oauth_popup=1; oauth_redirect_to=https%3A%2F%2Fexample.com%2Fsettings%3Ftab%3Dsecurity',
    );

    sendOAuthRedirect(event, '/');

    expect(event.res.status).toBe(302);
    expect(event.res.headers.get('location')).toBe(
      '/auth/oauth/popup?redirectTo=%2Fsettings%3Ftab%3Dsecurity',
    );
    expect(event.res.headers.getSetCookie()).toEqual([
      'oauth_popup=; Max-Age=0; Path=/',
      'oauth_redirect_to=; Max-Age=0; Path=/',
    ]);
  });

  it('does not forward a popup to a different origin', () => {
    const event = createOAuthEvent('oauth_popup=1; oauth_redirect_to=https%3A%2F%2Fother.example');

    sendOAuthRedirect(event, '/');

    expect(event.res.headers.get('location')).toBe('/auth/oauth/popup?redirectTo=%2F');
  });
});
