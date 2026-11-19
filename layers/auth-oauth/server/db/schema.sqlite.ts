import { sqliteTable, text, integer, unique, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { users } from '#layers/auth/server/db/schema.sqlite';

const timestampColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create (needs trigger or manual update for 'on update')
};

export const oauthAccounts = sqliteTable(
  'oauth_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'google', 'github', 'discord', etc.
    providerAccountId: text('provider_account_id').notNull(), // Google sub, GitHub user id, etc.
    email: text('email'), // Provider email (display only)
    name: text('name'), // Provider display name
    avatarUrl: text('avatar_url'), // Provider avatar
    ...timestampColumns,
  },
  (table) => [
    unique().on(table.provider, table.providerAccountId), // One link per provider account globally
    unique().on(table.userId, table.provider), // One provider type per user
    index('oauth_accounts_user_idx').on(table.userId),
  ],
);

export const usersOAuthRelations = relations(users, ({ many }) => ({
  oauthAccounts: many(oauthAccounts),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));
