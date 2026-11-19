import { defineOAuthProvider } from '../defineOAuthProvider';
import { oidcCredentialsSchema } from '../../../shared/schemas/oauthSchema';
import type { OidcOAuthResult } from '../../../types/providerResults';

export default defineOAuthProvider({
  id: 'oidc',
  credentialsSchema: oidcCredentialsSchema,
  createHandler: ({ onSuccess, onError }) =>
    defineOAuthOidcEventHandler<OidcOAuthResult['user']>({
      config: { scope: ['openid', 'email', 'profile'] },
      onSuccess,
      onError,
    }),
  toAccount: ({ user }: OidcOAuthResult) => ({
    providerAccountId: user.sub,
    email: user.email,
    name: user.name ?? user.preferred_username ?? '',
    avatarUrl: user.picture,
  }),
});
