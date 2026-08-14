import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { userLockScreen } from '~~/server/db/schema.sqlite';
import { commonSchemaFragments } from './common';

export { commonSchemaFragments } from './common';

// Lock screen schemas
export const createUserLockScreenSchema = createInsertSchema(userLockScreen, {
  userId: commonSchemaFragments.userId,
  ...commonSchemaFragments.coerceDates,
  lastActivityTime: z.coerce.date(),
  lastFailedAttempt: z.coerce.date().nullish(),
});
export type UserLockScreenCreateInput = z.infer<typeof createUserLockScreenSchema>;

export const updateUserLockScreenSchema = createUpdateSchema(userLockScreen, {
  userId: commonSchemaFragments.userId,
  ...commonSchemaFragments.coerceDates,
  // Optional: an update touches whichever fields it names, and callers that only
  // rotate backup codes have no activity time to send.
  lastActivityTime: z.coerce.date().optional(),
  lastFailedAttempt: z.coerce.date().nullish(),
});
export type UserLockScreenUpdateInput = z.infer<typeof updateUserLockScreenSchema>;

// Lock screen settings schema (excludes security fields like totpSecret, failedAttempts, etc.)
export const updateUserLockScreenSettingsSchema = createUpdateSchema(userLockScreen, {
  userId: commonSchemaFragments.userId,
  lockTimeout: z.number().int().min(-1).max(1440),
  showMessage: z.boolean(),
  customMessage: z.string().max(100).optional(),
  lastActivityTime: z.coerce.date().optional(),
  ...commonSchemaFragments.coerceDates,
}).omit({
  totpSecret: true,
  backupCodes: true,
  failedAttempts: true,
  lastFailedAttempt: true,
});
export type UserLockScreenSettingsUpdateInput = z.infer<typeof updateUserLockScreenSettingsSchema>;
