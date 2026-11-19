import { describe, expect, it } from 'vitest';
import { getOAuthReadiness } from '#layers/auth-oauth/server/oauth/readiness';

const credentials = { clientId: 'client-id', clientSecret: 'client-secret' };

function check(configured: unknown, oauth: unknown) {
  return getOAuthReadiness({ public: { site: { auth: { oauth: configured } } }, oauth });
}

describe('OAuth provider readiness', () => {
  it('returns listed providers with credentials in site order, without duplicates', () => {
    const result = check(['github', 'google', 'github'], {
      google: credentials,
      github: credentials,
    });

    expect(result.ready).toEqual(['github', 'google']);
  });

  it('does not make an unlisted provider ready even with credentials', () => {
    expect(check([], { google: credentials }).ready).toEqual([]);
  });

  it('reports enabled providers without both credentials', () => {
    const result = check(['google', 'github'], {
      google: { clientId: 'client-id' },
      github: { ...credentials, clientSecret: ' ' },
    });

    expect(result.ready).toEqual([]);
    expect(result.missingCredentials).toEqual(['google', 'github']);
  });

  it('ignores unknown ids without discarding valid ones', () => {
    const result = check(['toString', 'custom', 'discord'], {
      custom: credentials,
      discord: credentials,
    });

    expect(result.ready).toEqual(['discord']);
    expect(result.unknownProviders).toEqual(['toString', 'custom']);
  });

  it('requires discovery settings for OIDC', () => {
    expect(check(['oidc'], { oidc: credentials }).missingCredentials).toEqual(['oidc']);
    expect(
      check(['oidc'], {
        oidc: {
          ...credentials,
          openidConfig: 'https://issuer.example/.well-known/openid-configuration',
        },
      }).ready,
    ).toEqual(['oidc']);
    expect(
      check(['oidc'], {
        oidc: {
          ...credentials,
          openidConfig: {
            authorization_endpoint: 'https://issuer.example/authorize',
            token_endpoint: 'https://issuer.example/token',
          },
        },
      }).ready,
    ).toEqual(['oidc']);
  });
});
