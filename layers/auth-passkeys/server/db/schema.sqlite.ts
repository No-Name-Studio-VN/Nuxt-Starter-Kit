import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import type { WebAuthnCredential } from '#auth-utils';
import { users } from '../../../auth/server/db/schema.sqlite';

const timestampColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create (needs trigger or manual update for 'on update')
};

// One row per registered passkey (WebAuthn credential).
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

export const credentialsRelations = relations(credentials, ({ one }) => ({
  user: one(users, {
    fields: [credentials.userId],
    references: [users.id],
  }),
}));
