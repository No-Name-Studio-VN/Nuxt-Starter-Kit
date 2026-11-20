import { emailFieldSchema } from '#shared/schemas/common';
import { defineOAuthProvider } from '../defineOAuthProvider';
import type { DiscordOAuthResult } from '../../../types/providerResults';

export default defineOAuthProvider({
  id: 'discord',
  createHandler: ({ onSuccess, onError }) =>
    defineOAuthDiscordEventHandler({ config: { scope: ['identify', 'email'], emailRequired: false }, onSuccess, onError }),
  toAccount: ({ user }: DiscordOAuthResult) => ({
    providerAccountId: user.id,
    email: emailFieldSchema().safeParse(user.email).data,
    emailVerified: user.verified === true,
    emailAuthoritative: user.verified === true,
    name: user.global_name ?? user.username ?? '',
    avatarUrl:
      typeof user.avatar === 'string' && typeof user.id === 'string'
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp`
        : undefined,
  }),
});
