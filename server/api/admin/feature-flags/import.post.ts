import featureFlagService from '~~/server/utils/database/featureFlag';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import { featureFlagImportPayloadSchema } from '#shared/schemas/featureFlagSchema';
import type { FeatureFlagImportSummaryPayload } from '~~/types/admin';

/**
 * Import feature flags from a JSON payload.
 * Upserts by default (inserts new, updates existing).
 * Set skipExisting: true to only import new flags.
 */
export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) =>
    featureFlagImportPayloadSchema.safeParse(body),
  );
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid import data.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const { flags: flagsToImport, skipExisting } = result.data;

  // If skipExisting, filter out flags that already exist
  let flagsData = flagsToImport;
  if (skipExisting) {
    const existing = await featureFlagService.getList();
    const existingKeys = new Set(existing.map((f) => f.key));
    flagsData = flagsToImport.filter((f) => !existingKeys.has(f.key));
  }

  if (flagsData.length === 0) {
    const response: FeatureFlagImportSummaryPayload = {
      created: 0,
      updated: 0,
      skipped: flagsToImport.length,
    };
    return success(response);
  }

  const summary = await featureFlagService.bulkUpsert(flagsData);

  // Audit log
  const session = await requireUserSession(event);
  await featureFlagService.logAudit({
    flagKey: '*',
    action: 'created',
    actorId: session.user.id,
    newValue: {
      action: 'bulk_import',
      created: summary.created,
      updated: summary.updated,
      skipped: flagsToImport.length - flagsData.length,
      keys: flagsData.map((f) => f.key),
    },
  });

  const response: FeatureFlagImportSummaryPayload = {
    ...summary,
    skipped: flagsToImport.length - flagsData.length,
  };
  return success(response);
});
