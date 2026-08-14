import featureFlagService from '~~/server/utils/database/featureFlag';
import { apiError, success } from '~~/server/utils/apiResponse';
import type { DeletePayload } from '~~/types/admin';

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key');
  if (!key) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Flag key parameter is missing.',
      code: 'FLAG_KEY_REQUIRED',
    });
  }

  const existing = await featureFlagService.getByKey(key);
  if (!existing) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: `Feature flag "${key}" not found.`,
      code: 'FEATURE_FLAG_NOT_FOUND',
    });
  }

  await featureFlagService.delete(key);

  // Audit log
  const session = await requireUserSession(event);
  await featureFlagService.logAudit({
    flagKey: key,
    action: 'deleted',
    actorId: session.user.id,
    previousValue: {
      key: existing.key,
      description: existing.description,
      enabled: existing.enabled,
      rules: existing.rules,
      rolloutPct: existing.rolloutPct,
      owner: existing.owner,
      expiresAt: existing.expiresAt?.toISOString() ?? null,
    },
  });

  const response: DeletePayload = { deleted: true };
  return success(response);
});
