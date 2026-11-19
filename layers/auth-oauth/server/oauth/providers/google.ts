import { defineOAuthProvider } from '../defineOAuthProvider';
import type { GoogleOAuthResult } from '../../../types/providerResults';

export default defineOAuthProvider({
  id: 'google',
  createHandler: ({ onSuccess, onError }) =>
    defineOAuthGoogleEventHandler({
      config: { scope: ['openid', 'email', 'profile'] },
      onSuccess,
      onError,
    }),
  toAccount: ({ user }: GoogleOAuthResult) => ({
    providerAccountId: user.sub,
    email: user.email,
    name: user.name ?? '',
    avatarUrl: user.picture,
  }),
});
