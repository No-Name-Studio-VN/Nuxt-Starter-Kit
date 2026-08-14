import { success } from '~~/server/utils/apiResponse';
import { seedDefaultFeatureFlags } from '~~/server/utils/database/seed';

export default defineEventHandler(async () => {
  const summary = await seedDefaultFeatureFlags();
  return success(summary);
});
