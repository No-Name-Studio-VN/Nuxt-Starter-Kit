import { sqliteTable, text, integer, unique, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import type { WebAuthnCredential } from '#auth-utils'
import type { AuthTokenType } from '#shared/commonEnums'

const timestampColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()), // Auto-set on create
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()), // Auto-set on create (needs trigger or manual update for 'on update')
}

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  password: text('password').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(true),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }), // Can be null if never logged in
  ...timestampColumns,
})

export const authTokens = sqliteTable('auth_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  type: text('type').$type<AuthTokenType>().notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  ...timestampColumns,
}, table => [
  index('auth_tokens_user_idx').on(table.userId),
  index('auth_tokens_token_idx').on(table.token),
  index('auth_tokens_type_idx').on(table.type),
  index('auth_tokens_expires_idx').on(table.expiresAt),
])

export const userTwoFactor = sqliteTable('user_two_factor', {
  userId: integer('user_id').primaryKey().notNull().references(() => users.id, { onDelete: 'cascade' }),
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
  backupCodes: text('backup_codes', { mode: 'json' }).$type<string[]>(),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lastFailedAttempt: integer('last_failed_attempt', { mode: 'timestamp' }),
  ...timestampColumns,
}, table => [
  index('user_two_factor_user_idx').on(table.userId),
])

export const credentials = sqliteTable('credentials', {
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  id: text('id').notNull().primaryKey(), // WebAuthn Credential IDs are unique strings, safer as PK
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull(),
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
  transports: text('transports', { mode: 'json' }).notNull().$type<WebAuthnCredential['transports']>(),
  ...timestampColumns,
}, table => ({
  userIndex: index('credentials_user_idx').on(table.userId), // Index for faster lookups by user
}))

// ── OAuth Accounts Table ──────────────────────────────────────

export const oauthAccounts = sqliteTable('oauth_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'google', 'github', 'discord', etc.
  providerAccountId: text('provider_account_id').notNull(), // Google sub, GitHub user id, etc.
  email: text('email'), // Provider email (display only)
  name: text('name'), // Provider display name
  avatarUrl: text('avatar_url'), // Provider avatar
  ...timestampColumns,
}, table => [
  unique().on(table.provider, table.providerAccountId), // One link per provider account globally
  unique().on(table.userId, table.provider), // One provider type per user
  index('oauth_accounts_user_idx').on(table.userId),
])

// Relations (useful for queries)
export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}))

export const authTokensRelations = relations(authTokens, ({ one }) => ({
  user: one(users, {
    fields: [authTokens.userId],
    references: [users.id],
  }),
}))

export const userTwoFactorRelations = relations(userTwoFactor, ({ one }) => ({
  user: one(users, {
    fields: [userTwoFactor.userId],
    references: [users.id],
  }),
}))

export const usersRelations = relations(users, ({ many, one }) => ({
  credentials: many(credentials),
  oauthAccounts: many(oauthAccounts),
  authTokens: many(authTokens),
  twoFactor: one(userTwoFactor),
}))

export const credentialsRelations = relations(credentials, ({ one }) => ({
  user: one(users, {
    fields: [credentials.userId],
    references: [users.id],
  }),
}))
