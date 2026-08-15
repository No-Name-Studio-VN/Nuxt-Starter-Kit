import type { tables } from '~~/server/utils/db';

export type User = typeof tables.users.$inferSelect;
export type DBLockScreen = typeof tables.userLockScreen.$inferSelect;
export type DBPasskey = typeof tables.credentials.$inferSelect;
export type DBAuthToken = typeof tables.authTokens.$inferSelect;
export type DBOAuthAccount = typeof tables.oauthAccounts.$inferSelect;
// <nsk:feature-flags>
export type DBFeatureFlag = typeof tables.featureFlags.$inferSelect;
export type DBFeatureFlagAuditLog = typeof tables.featureFlagAuditLog.$inferSelect;
// </nsk:feature-flags>

// Client-safe version of DBLockScreen that excludes sensitive pinHash
export type DBLockScreenClient = Omit<DBLockScreen, 'totpSecret' | 'backupCodes'> & {
  hasTotpSet: boolean;
};
