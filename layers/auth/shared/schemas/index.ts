import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { commonSchemaFragments } from '#shared/schemas/common';
import { userLockScreen } from '../../server/db/schema.sqlite';
import { userIdSchema } from './userSchema';

// Lock screen schemas
export const createUserLockScreenSchema = createInsertSchema(userLockScreen, {
  userId: userIdSchema,
  ...commonSchemaFragments.coerceDates,
  lastActivityTime: z.coerce.date(),
  lastFailedAttempt: z.coerce.date().nullish(),
});
export type UserLockScreenCreateInput = z.infer<typeof createUserLockScreenSchema>;

export const updateUserLockScreenSchema = createUpdateSchema(userLockScreen, {
  userId: userIdSchema,
  ...commonSchemaFragments.coerceDates,
  // Optional: an update touches whichever fields it names, so callers that only
  // change one field need not send an activity time.
  lastActivityTime: z.coerce.date().optional(),
  lastFailedAttempt: z.coerce.date().nullish(),
});
export type UserLockScreenUpdateInput = z.infer<typeof updateUserLockScreenSchema>;

// Lock screen settings schema (excludes the failed-attempt counters)
export const updateUserLockScreenSettingsSchema = createUpdateSchema(userLockScreen, {
  userId: userIdSchema,
  lockTimeout: z.number().int().min(-1).max(1440),
  showMessage: z.boolean(),
  customMessage: z.string().max(100).optional(),
  lastActivityTime: z.coerce.date().optional(),
  ...commonSchemaFragments.coerceDates,
}).omit({
  failedAttempts: true,
  lastFailedAttempt: true,
});
export type UserLockScreenSettingsUpdateInput = z.infer<typeof updateUserLockScreenSettingsSchema>;
