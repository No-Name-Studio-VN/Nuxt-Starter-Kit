import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { users } from '../../../auth/server/db/schema.sqlite';
import type { FeatureFlagRules } from '../../types/featureFlags';

const timestampColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()), // Auto-set on create (needs trigger or manual update for 'on update')
};

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

export const featureFlagAuditLogRelations = relations(featureFlagAuditLog, ({ one }) => ({
  actor: one(users, {
    fields: [featureFlagAuditLog.actorId],
    references: [users.id],
  }),
}));
