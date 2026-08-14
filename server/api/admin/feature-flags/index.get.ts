import featureFlagService from '~~/server/utils/database/featureFlag';
import { success } from '~~/server/utils/apiResponse';

export default defineEventHandler(async () => {
  const flags = await featureFlagService.getList();
  return success(flags);
});
