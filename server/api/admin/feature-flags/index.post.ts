import featureFlagService from '~~/server/utils/database/featureFlag';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import { featureFlagInsertSchema } from '#shared/schemas/featureFlagSchema';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => featureFlagInsertSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The submitted feature flag data is invalid.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  // Check if flag key already exists
  const existing = await featureFlagService.getByKey(result.data.key);
  if (existing) {
    throw apiError({
      status: 409,
      statusText: 'Conflict',
      message: `Feature flag "${result.data.key}" already exists.`,
      code: 'FEATURE_FLAG_ALREADY_EXISTS',
    });
  }

  const flag = await featureFlagService.create(result.data);

  // Audit log
  const session = await requireUserSession(event);
  await featureFlagService.logAudit({
    flagKey: flag.key,
    action: 'created',
    actorId: session.user.id,
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
