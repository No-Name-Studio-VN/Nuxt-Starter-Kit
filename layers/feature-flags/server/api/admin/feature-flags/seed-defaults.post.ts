import { success } from '#layers/server-core/server/utils/apiResponse';
import { seedDefaultFeatureFlags } from '#layers/feature-flags/server/utils/database/featureFlagSeed';

export default defineEventHandler(async () => {
  const summary = await seedDefaultFeatureFlags();
  return success(summary);
});
