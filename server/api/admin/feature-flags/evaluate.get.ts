import { apiError, success } from '~~/server/utils/apiResponse';
import { evaluateFlag } from '~~/server/utils/featureFlags';
import type { FlagContext } from '~~/types/featureFlags';
import type { FeatureFlagEvaluatePayload } from '~~/types/admin';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const key = typeof query.key === 'string' ? query.key : undefined;

  if (!key) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. "key" query parameter is required.',
      code: 'FEATURE_FLAG_KEY_REQUIRED',
    });
  }

  // Build context from query params (for admin testing)
  const context: FlagContext = {
    userId: query.userId ? Number(query.userId) : undefined,
    isAdmin: query.isAdmin === 'true',
    tier: query.tier === 'free' || query.tier === 'premium' ? query.tier : undefined,
    region: typeof query.region === 'string' ? query.region : undefined,
  };

  const result = await evaluateFlag(key, context);
  const response: FeatureFlagEvaluatePayload = {
    key,
    enabled: result,
    context: { userId: context.userId, isAdmin: context.isAdmin ?? false, region: context.region },
  };
  return success(response);
});
