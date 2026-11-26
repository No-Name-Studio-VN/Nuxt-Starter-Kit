import { z } from 'zod';
import { createInsertSchema, createUpdateSchema, createSelectSchema } from 'drizzle-zod';
import { commonSchemaFragments } from '#shared/schemas/common';
import { featureFlags } from '../../server/db/schema.sqlite';

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
  .min(2, 'admin.flags.key_min')
  .max(64, 'admin.flags.key_max')
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'admin.flags.key_format');

const rolloutPercentageSchema = z.coerce
  .number({ error: 'admin.flags.rollout_range' })
  .int('admin.flags.rollout_range')
  .min(0, 'admin.flags.rollout_range')
  .max(100, 'admin.flags.rollout_range');

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
  description: z.string().max(500, 'admin.flags.description_size').default(''),
  enabled: z.boolean().default(false),
  rules: featureFlagRulesSchema,
  rolloutPct: rolloutPercentageSchema.default(100),
  owner: z.string().max(100, 'admin.flags.owner_size').default(''),
  expiresAt: z.coerce.date().optional().nullable(),
  ...commonSchemaFragments.coerceDates,
});

/**
 * Schema for updating an existing feature flag.
 */
export const featureFlagUpdateSchema = createUpdateSchema(featureFlags, {
  key: flagKeySchema.optional(),
  description: z.string().max(500, 'admin.flags.description_size').optional(),
  enabled: z.boolean().optional(),
  rules: featureFlagRulesSchema,
  rolloutPct: rolloutPercentageSchema.optional(),
  owner: z.string().max(100, 'admin.flags.owner_size').optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  ...commonSchemaFragments.coerceDates,
});

/**
 * Select schema for type inference from database queries.
 */
export const featureFlagSelectSchema = createSelectSchema(featureFlags);

export const featureFlagImportFlagSchema = z.object({
  key: featureFlagImportKeySchema,
  description: z.string().max(500, 'admin.flags.description_size').default(''),
  enabled: z.boolean().default(false),
  rules: featureFlagRulesSchema,
  rolloutPct: rolloutPercentageSchema.default(100),
  owner: z.string().max(100, 'admin.flags.owner_size').default(''),
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
