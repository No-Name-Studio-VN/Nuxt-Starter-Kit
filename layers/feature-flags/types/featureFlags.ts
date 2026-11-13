import type { tables } from '#layers/database/server/utils/db';

export type DBFeatureFlag = typeof tables.featureFlags.$inferSelect;
export type DBFeatureFlagAuditLog = typeof tables.featureFlagAuditLog.$inferSelect;

export type FeatureFlagTier = 'free' | 'premium';

export interface FeatureFlagRules {
  /** Only allow these specific user IDs */
  allowedUserIds?: number[];
  /** Only allow these subscription tiers */
  allowedTiers?: FeatureFlagTier[];
  /** Only allow these regions */
  allowedRegions?: string[];
  /** Only allow admin users */
  adminOnly?: boolean;
}

/**
 * Context provided to the evaluation engine to determine
 * whether a flag should be enabled for a specific request.
 */
export interface FlagContext {
  userId?: number;
  isAdmin?: boolean;
  tier?: FeatureFlagTier;
  region?: string;
}

export interface FlagContextUser {
  id: number;
  isAdmin?: boolean;
  subscription?: {
    tier?: number | null;
  } | null;
}

/**
 * Cached flag config shape stored in KV.
 * Strips metadata (owner, timestamps) — only what the evaluation engine needs.
 */
export interface CachedFlagConfig {
  enabled: boolean;
  rules?: FeatureFlagRules | null;
  rolloutPct: number;
}

export interface FeatureFlagAuditEntryInput {
  flagKey: string;
  action: 'created' | 'updated' | 'deleted' | 'toggled';
  actorId?: number | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

/** A flag the seed creates when no flag with its key exists yet. */
export interface SeedFeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPct: number;
  owner: string;
}

/**
 * What seeding the default flags did; also the `featureFlags` counts of the seed
 * summary (a type alias, so it fits the seed's `Record<string, number>` counts).
 */
export type FeatureFlagSeedSummary = {
  created: number;
  skipped: number;
};

export interface DeletePayload {
  deleted: true;
}

export interface FeatureFlagEvaluatePayload {
  key: string;
  enabled: boolean;
  context: {
    userId?: number;
    isAdmin: boolean;
    region?: string;
  };
}

export interface FeatureFlagImportSummaryPayload {
  created: number;
  updated: number;
  skipped: number;
}
