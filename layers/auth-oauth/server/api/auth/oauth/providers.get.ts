import { success } from '#layers/server-core/server/utils/apiResponse';
import { getOAuthReadiness } from '../../../oauth/readiness';

export default defineEventHandler((event) => {
  return success(getOAuthReadiness(useRuntimeConfig(event)).ready);
});
