import { defineOAuthProvider } from '../defineOAuthProvider';
import type { GitHubOAuthResult } from '../../../types/providerResults';

export default defineOAuthProvider({
  id: 'github',
  createHandler: ({ onSuccess, onError }) =>
    defineOAuthGitHubEventHandler({ config: { emailRequired: true }, onSuccess, onError }),
  toAccount: ({ user }: GitHubOAuthResult) => ({
    providerAccountId: typeof user.id === 'number' ? String(user.id) : undefined,
    email: user.email,
    name: user.name ?? user.login,
    avatarUrl: user.avatar_url,
  }),
});
