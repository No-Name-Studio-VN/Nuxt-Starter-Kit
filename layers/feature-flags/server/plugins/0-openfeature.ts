import { OpenFeature } from '@openfeature/server-sdk';
import { KVFeatureFlagProvider } from '#layers/feature-flags/server/utils/openfeature/KVFeatureFlagProvider';
//import featureFlagService from '#layers/feature-flags/server/utils/database/featureFlag';

/**
 * Registers the KV-backed OpenFeature provider.
 *
 * Startup D1 → KV synchronization is disabled. This plugin reads existing KV
 * data through the provider; it does not populate KV.
 *
 * The `0-` prefix makes this run first among the feature-flags layer's plugins. It only
 * registers the provider; evaluation happens in request handlers.
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
