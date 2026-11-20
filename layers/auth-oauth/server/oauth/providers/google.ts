import { emailFieldSchema } from '#shared/schemas/common';
import { defineOAuthProvider } from '../defineOAuthProvider';
import type { GoogleOAuthResult } from '../../../types/providerResults';

export function googleProfile(user: GoogleOAuthResult['user']) {
  const email = emailFieldSchema().safeParse(user.email).data;
  const emailVerified = Boolean(email) && user.email_verified === true;
  return {
    providerAccountId: user.sub,
    email,
    name: typeof user.name === 'string' ? user.name : email ?? '',
    avatarUrl: typeof user.picture === 'string' ? user.picture : undefined,
    emailVerified,
    emailAuthoritative: emailVerified && (
      Boolean(email?.endsWith('@gmail.com')) || (typeof user.hd === 'string' && Boolean(user.hd.trim()))
    ),
  };
}

export default defineOAuthProvider({
  id: 'google',
  createHandler: ({ onSuccess, onError }) =>
    defineOAuthGoogleEventHandler({
      config: { scope: ['openid', 'email', 'profile'] },
      onSuccess,
      onError,
    }),
  toAccount: ({ user }: GoogleOAuthResult) => googleProfile(user),
});
