import featureFlagService from '~~/server/utils/database/featureFlag';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import { featureFlagUpdateSchema } from '#shared/schemas/featureFlagSchema';

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

  const result = await readValidatedBody(event, (body) => featureFlagUpdateSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The submitted feature flag data is invalid.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const flag = await featureFlagService.update({ key, ...result.data });

  // Audit log
  const session = await requireUserSession(event);
  const action =
    result.data.enabled !== undefined && result.data.enabled !== existing.enabled
      ? 'toggled'
      : 'updated';
  await featureFlagService.logAudit({
    flagKey: key,
    action,
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
    newValue: {
      key: flag.key,
      description: flag.description,
      enabled: flag.enabled,
      rules: flag.rules,
      rolloutPct: flag.rolloutPct,
      owner: flag.owner,
      expiresAt: flag.expiresAt?.toISOString() ?? null,
    },
  });

  return success(flag);
});
