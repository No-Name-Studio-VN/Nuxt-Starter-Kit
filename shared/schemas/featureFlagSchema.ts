import { z } from 'zod';
import { createInsertSchema, createUpdateSchema, createSelectSchema } from 'drizzle-zod';
import { featureFlags } from '~~/server/db/schema.sqlite';
import { commonSchemaFragments } from '.';

/**
 * Targeting rules schema — optional complex targeting for feature flags.
 */
export const featureFlagRulesSchema = z
  .object({
    allowedUserIds: z.array(z.number().int().positive()).optional(),
    allowedTiers: z.array(z.enum(['free', 'premium'])).optional(),
    allowedRegions: z.array(z.string().trim()).optional(),
    adminOnly: z.boolean().optional(),
  })
  .optional()
  .nullable();

/**
 * Flag key format: lowercase alphanumeric with hyphens, 2-64 chars.
 */
export const flagKeySchema = z
  .string()
  .min(2, 'Flag key must be at least 2 characters')
  .max(64, 'Flag key must be at most 64 characters')
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Flag key must be lowercase alphanumeric with hyphens (e.g., "new-reader-v2")',
  );

const featureFlagImportKeySchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);

/**
 * Schema for creating a new feature flag.
 */
export const featureFlagInsertSchema = createInsertSchema(featureFlags, {
  key: flagKeySchema,
  description: z.string().max(500).default(''),
  enabled: z.boolean().default(false),
  rules: featureFlagRulesSchema,
  rolloutPct: z.coerce.number().int().min(0).max(100).default(100),
  owner: z.string().max(100).default(''),
  expiresAt: z.coerce.date().optional().nullable(),
  ...commonSchemaFragments.coerceDates,
});

/**
 * Schema for updating an existing feature flag.
 */
export const featureFlagUpdateSchema = createUpdateSchema(featureFlags, {
  key: flagKeySchema.optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  rules: featureFlagRulesSchema,
  rolloutPct: z.coerce.number().int().min(0).max(100).optional(),
  owner: z.string().max(100).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  ...commonSchemaFragments.coerceDates,
});

/**
 * Select schema for type inference from database queries.
 */
export const featureFlagSelectSchema = createSelectSchema(featureFlags);

export const featureFlagImportFlagSchema = z.object({
  key: featureFlagImportKeySchema,
  description: z.string().max(500).default(''),
  enabled: z.boolean().default(false),
  rules: featureFlagRulesSchema,
  rolloutPct: z.coerce.number().int().min(0).max(100).default(100),
  owner: z.string().max(100).default(''),
  expiresAt: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .transform((value) => (value ? new Date(value) : null)),
});

export const featureFlagImportPayloadSchema = z.object({
  flags: z.array(featureFlagImportFlagSchema).min(1, 'At least one flag is required'),
  skipExisting: z.boolean().default(false),
});

export type FeatureFlagInput = z.infer<typeof featureFlagInsertSchema>;
export type FeatureFlagUpdateInput = z.infer<typeof featureFlagUpdateSchema>;
export type FeatureFlagSelect = z.infer<typeof featureFlagSelectSchema>;
export type FeatureFlagImportFlagInput = z.infer<typeof featureFlagImportFlagSchema>;
export type FeatureFlagImportPayloadInput = z.infer<typeof featureFlagImportPayloadSchema>;
