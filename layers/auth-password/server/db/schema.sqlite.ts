import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { users } from '#layers/auth/server/db/schema.sqlite';
import type { AuthTokenKind } from '../../types/authTokens';

const timestampColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create (needs trigger or manual update for 'on update')
};

/** One row per user who can sign in with a password; no row means no password. */
export const userPasswords = sqliteTable('user_passwords', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const authTokens = sqliteTable(
  'auth_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    type: text('type').$type<AuthTokenKind>().notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp' }),
    ...timestampColumns,
  },
  (table) => [
    index('auth_tokens_user_idx').on(table.userId),
    index('auth_tokens_token_idx').on(table.token),
    index('auth_tokens_type_idx').on(table.type),
    index('auth_tokens_expires_idx').on(table.expiresAt),
  ],
);

export const usersPasswordRelations = relations(users, ({ one, many }) => ({
  password: one(userPasswords),
  authTokens: many(authTokens),
}));

export const userPasswordsRelations = relations(userPasswords, ({ one }) => ({
  user: one(users, {
    fields: [userPasswords.userId],
    references: [users.id],
  }),
}));

export const authTokensRelations = relations(authTokens, ({ one }) => ({
  user: one(users, {
    fields: [authTokens.userId],
    references: [users.id],
  }),
}));
