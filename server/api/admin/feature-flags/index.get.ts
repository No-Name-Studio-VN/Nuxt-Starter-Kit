import featureFlagService from '~~/server/utils/database/featureFlag';
import { success } from '#layers/server-core/server/utils/apiResponse';

export default defineEventHandler(async () => {
  const flags = await featureFlagService.getList();
  return success(flags);
});
