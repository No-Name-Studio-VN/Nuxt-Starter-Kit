import { defineOAuthProvider } from '../defineOAuthProvider';
import type { DiscordOAuthResult } from '../../../types/providerResults';

export default defineOAuthProvider({
  id: 'discord',
  createHandler: ({ onSuccess, onError }) =>
    defineOAuthDiscordEventHandler({ config: { emailRequired: true }, onSuccess, onError }),
  toAccount: ({ user }: DiscordOAuthResult) => ({
    providerAccountId: user.id,
    email: user.email,
    name: user.global_name ?? user.username,
    avatarUrl:
      typeof user.avatar === 'string' && typeof user.id === 'string'
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp`
        : undefined,
  }),
});
