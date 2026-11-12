import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import type { WebAuthnCredential } from '#auth-utils';
import {
  authTokens,
  oauthAccounts,
  userLockScreen,
  users,
} from '../../../auth/server/db/schema.sqlite';
import type { FeatureFlagRules } from '../../../../types/featureFlags';

const timestampColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create (needs trigger or manual update for 'on update')
};

// WebAuthn credentials belong to the auth module: the table is read by password
// sign-in and the profile as well as by passkeys, but a database-only project
// has no accounts to hold credentials for. The migration that created it stays,
// as it does for the feature flag tables below.
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

// ── Feature Flags Tables ──────────────────────────────────────
export const featureFlags = sqliteTable('feature_flags', {
  key: text('key').primaryKey(), // e.g. 'new-reader-v2', 'premium-dark-mode'
  description: text('description').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  rules: text('rules', { mode: 'json' }).$type<FeatureFlagRules>(),
  rolloutPct: integer('rollout_pct').notNull().default(100), // 0-100
  owner: text('owner').notNull().default(''), // who owns this flag
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  ...timestampColumns,
});

export const featureFlagAuditLog = sqliteTable(
  'feature_flag_audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    flagKey: text('flag_key').notNull(),
    action: text('action').notNull(), // 'created' | 'updated' | 'deleted' | 'toggled'
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    previousValue: text('previous_value', { mode: 'json' }).$type<Record<string, unknown>>(),
    newValue: text('new_value', { mode: 'json' }).$type<Record<string, unknown>>(),
    ...timestampColumns,
  },
  (table) => [
    index('ff_audit_flag_key_idx').on(table.flagKey),
    index('ff_audit_actor_idx').on(table.actorId),
    index('ff_audit_created_idx').on(table.createdAt),
  ],
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

export const featureFlagAuditLogRelations = relations(featureFlagAuditLog, ({ one }) => ({
  actor: one(users, {
    fields: [featureFlagAuditLog.actorId],
    references: [users.id],
  }),
}));
