import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import type { WebAuthnCredential } from '#auth-utils';
import {
  authTokens,
  oauthAccounts,
  userLockScreen,
  users,
} from '../../../auth/server/db/schema.sqlite';

const timestampColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create (needs trigger or manual update for 'on update')
};

// WebAuthn credentials belong to the auth module: the table is read by password
// sign-in and the profile as well as by passkeys, but a database-only project
// has no accounts to hold credentials for. The migration that created it stays.
export const credentials = sqliteTable(
  'credentials',
  {
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    id: text('id').notNull().primaryKey(), // WebAuthn Credential IDs are unique strings, safer as PK
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    transports: text('transports', { mode: 'json' })
      .notNull()
      .$type<WebAuthnCredential['transports']>(),
    ...timestampColumns,
  },
  (table) => ({
    userIndex: index('credentials_user_idx').on(table.userId), // Index for faster lookups by user
  }),
);

// The users relations stay here while they name credentials: drizzle types a
// table's relations from a single `relations()` call, and declaring them in the
// auth schema would make the two schema files import each other. Task 11 moves
// them to auth without credentials.
export const usersRelations = relations(users, ({ many, one }) => ({
  credentials: many(credentials),
  lockScreen: one(userLockScreen),
  oauthAccounts: many(oauthAccounts),
  authTokens: many(authTokens),
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
  user: one(users, {
    fields: [credentials.userId],
    references: [users.id],
  }),
}));
