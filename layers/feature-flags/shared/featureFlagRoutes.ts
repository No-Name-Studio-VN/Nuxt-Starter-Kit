import { adminRoutes } from '#layers/admin/shared/adminRoutes';

const { ADMIN_API_PREFIX } = adminRoutes;

export const featureFlagRoutes = {
  ADMIN_FEATURE_FLAGS: ADMIN_API_PREFIX + '/feature-flags',
  FLAGS_EVALUATE: '/api/flags',

  adminFeatureFlag: (key: string) => ADMIN_API_PREFIX + `/feature-flags/${key}`,
  adminFeatureFlagsExport: () => ADMIN_API_PREFIX + '/feature-flags/export',
  adminFeatureFlagsImport: () => ADMIN_API_PREFIX + '/feature-flags/import',
  adminFeatureFlagsSeedDefaults: () => ADMIN_API_PREFIX + '/feature-flags/seed-defaults',
};
