import { registerSeedTask } from '#layers/admin/server/utils/seedTasks';
import { seedDefaultFeatureFlags } from '#layers/feature-flags/server/utils/database/featureFlagSeed';

/** Creates the default flags whenever the admin seed runs (`pnpm db:seed` or `POST /api/admin/seed`). */
export default defineNitroPlugin(() => {
  registerSeedTask({
    id: 'feature-flags',
    order: 100,
    key: 'featureFlags',
    label: 'Feature flags',
    run: seedDefaultFeatureFlags,
  });
});
