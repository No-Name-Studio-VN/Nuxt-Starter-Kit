import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

const timestampColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create (needs trigger or manual update for 'on update')
};

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  isLocked: integer('is_locked', { mode: 'boolean' }).notNull().default(false),
  onboardingPending: integer('onboarding_pending', { mode: 'boolean' }).notNull().default(false),
  onboardingCompletedSteps: text('onboarding_completed_steps', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default([]),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }), // Can be null if never logged in
  ...timestampColumns,
}, (table) => [index('users_email_lower_idx').on(sql`lower(${table.email})`)]);

export const userLockScreen = sqliteTable('user_lock_screen', {
  userId: integer('user_id')
    .primaryKey()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lockTimeout: integer('lock_timeout').notNull().default(0),
  showMessage: integer('show_message', { mode: 'boolean' }).notNull().default(false),
  customMessage: text('custom_message'),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lastFailedAttempt: integer('last_failed_attempt', { mode: 'timestamp' }),
  lastActivityTime: integer('last_activity_time', { mode: 'timestamp' }),
  ...timestampColumns,
});

export const usersRelations = relations(users, ({ one }) => ({
  lockScreen: one(userLockScreen),
}));
