import { OpenFeature } from '@openfeature/server-sdk';
import { KVFeatureFlagProvider } from '~~/server/utils/openfeature/KVFeatureFlagProvider';
//import featureFlagService from '~~/server/utils/database/featureFlag';

/**
 * Syncs D1 → KV and registers the KV-backed OpenFeature provider.
 *
 * On Cloudflare Workers every request is a cold start. KV may be
 * empty even though D1 has all the flags. This plugin ensures KV is
 * populated before any flag evaluations happen.
 *
 * The `0-` prefix guarantees this runs before other plugins.
 */
export default defineNitroPlugin(async () => {
  // disabled it as it might not run in serverless environment
  // try {
  //   // Sync DB → KV so the evaluation engine has data
  //   await featureFlagService.syncToKV()
  //   console.log('[FeatureFlags] Synced all flags to KV')
  // }
  // catch (error) {
  //   console.warn('[FeatureFlags] Failed to sync flags to KV:', error)
  // }

  try {
    await OpenFeature.setProviderAndWait(new KVFeatureFlagProvider());
    console.log('[OpenFeature] KV provider registered successfully');
  } catch (error) {
    console.warn('[OpenFeature] Failed to register provider:', error);
  }
});
