import { registerOAuthLinkPolicy } from '#layers/auth/server/utils/oauthLinkPolicies';

export default defineNitroPlugin(() => {
  registerOAuthLinkPolicy({
    id: 'admin',
    order: 100,
    async run({ user }) {
      return { allow: !user.isAdmin };
    },
  });
});
