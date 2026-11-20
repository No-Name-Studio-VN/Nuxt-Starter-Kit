import { signInAvatarUrlSchema } from '#layers/auth/shared/schemas/lastSignInSchema';
import { registerSignInMethod } from '#layers/auth/server/utils/signInMethods';
import { getOAuthReadiness } from '../oauth/readiness';
import oauthAccountService from '../utils/database/oauthAccount';

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig();
  const { ready, missingCredentials, unknownProviders, invalidList } = getOAuthReadiness(config);
  if (invalidList) {
    console.error('[auth-oauth] site.config.ts auth.oauth must be an array of provider IDs.');
  }
  for (const provider of unknownProviders) {
    console.error(
      `[auth-oauth] Unknown provider ${JSON.stringify(provider)} in site.config.ts auth.oauth.`,
    );
  }
  for (const provider of missingCredentials) {
    console.error(`[auth-oauth] Missing credentials for enabled provider "${provider}".`);
  }
  if (
    import.meta.dev &&
    !invalidList &&
    !ready.length &&
    !missingCredentials.length &&
    !unknownProviders.length
  ) {
    console.warn('[auth-oauth] No providers are enabled in site.config.ts auth.oauth.');
  }

  registerSignInMethod({
    id: 'oauth',
    countCredentialsQuery: (userId, exclude) =>
      oauthAccountService.countCredentialsQuery(userId, getOAuthReadiness(useRuntimeConfig()).ready, exclude),
    buildUnverifiedEmailResetCleanup: (userId, redeemable) =>
      oauthAccountService.buildUnverifiedEmailResetCleanup(userId, redeemable),
    async resolveSessionPresentation(evidence) {
      if (evidence.method === 'oauth') {
        return { provider: evidence.oauth?.provider, avatarUrl: evidence.oauth?.avatarUrl };
      }
      const accounts = await oauthAccountService.getByUserId(evidence.user.id);
      return { avatarUrl: accounts.find((account) => signInAvatarUrlSchema.safeParse(account.avatarUrl).success)?.avatarUrl };
    },
    countCredentials: (userId) =>
      oauthAccountService.countByUserId(userId, getOAuthReadiness(useRuntimeConfig()).ready),
  });
});
