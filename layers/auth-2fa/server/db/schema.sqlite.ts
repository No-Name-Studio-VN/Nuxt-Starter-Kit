import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from '../../../auth/server/db/schema.sqlite';

const timestampColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create (needs trigger or manual update for 'on update')
};

// One row per account that has started 2FA setup. The failed-attempt counters
// stay on auth's user_lock_screen row, shared with the lock screen.
export const userTwoFactor = sqliteTable('user_two_factor', {
  userId: integer('user_id')
    .primaryKey()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  secret: text('secret'), // Base32 TOTP secret; set by setup, cleared by disable
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  backupCodes: text('backup_codes', { mode: 'json' }).$type<string[]>(),
  ...timestampColumns,
});
