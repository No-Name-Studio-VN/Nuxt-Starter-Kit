import featureFlagService from '~~/server/utils/database/featureFlag';
import { success } from '~~/server/utils/apiResponse';

/**
 * Export all feature flags as a portable JSON array.
 */
export default defineEventHandler(async () => {
  const flags = await featureFlagService.getList();

  // Strip timestamps and internal-only fields for portability
  const exportData = flags.map((flag) => ({
    key: flag.key,
    description: flag.description,
    enabled: flag.enabled,
    rules: flag.rules,
    rolloutPct: flag.rolloutPct,
    owner: flag.owner,
    expiresAt: flag.expiresAt ? new Date(flag.expiresAt).toISOString() : null,
  }));

  return success(exportData);
});
