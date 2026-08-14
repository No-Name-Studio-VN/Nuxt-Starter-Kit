import { OpenFeature, type EvaluationContext } from '@openfeature/server-sdk';
import { KV_FLAGS_KEY } from '#shared/constants/flags';
import type { FlagContext, FlagContextUser } from '~~/types/featureFlags';

export type { FlagContext, FlagContextUser } from '~~/types/featureFlags';

export function getUserFlagContext(user: FlagContextUser): FlagContext {
  return {
    userId: user.id,
    isAdmin: user.isAdmin ?? false,
    tier: user.subscription?.tier ? 'premium' : 'free',
  };
}

/**
 * Convert our FlagContext to OpenFeature EvaluationContext.
 */
function toEvaluationContext(context?: FlagContext): EvaluationContext {
  if (!context) return {};
  const evalCtx: EvaluationContext = {};
  if (context.userId !== undefined) evalCtx.targetingKey = context.userId.toString();
  if (context.isAdmin !== undefined) evalCtx.isAdmin = context.isAdmin;
  if (context.tier !== undefined) evalCtx.tier = context.tier;
  if (context.region !== undefined) evalCtx.region = context.region;
  return evalCtx;
}

/**
 * Get the OpenFeature client singleton.
 */
function getClient() {
  return OpenFeature.getClient();
}

function getRecordKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value);
}

/**
 * Evaluate whether a single feature flag is enabled for the given context.
 *
 * Uses the OpenFeature SDK, which delegates to the KVFeatureFlagProvider.
 * Returns the provided default value on any error.
 */
export async function evaluateFlag(
  key: string,
  context?: FlagContext,
  defaultValue = false,
): Promise<boolean> {
  try {
    const client = getClient();
    return await client.getBooleanValue(key, defaultValue, toEvaluationContext(context));
  } catch (error) {
    console.warn(
      `[FeatureFlags] Evaluation failed for "${key}", defaulting to ${defaultValue}:`,
      error,
    );
    return defaultValue;
  }
}

/**
 * Batch-evaluate multiple feature flags for the given context.
 */
export async function evaluateFlags(
  keys: string[],
  context?: FlagContext,
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  const evalCtx = toEvaluationContext(context);
  const client = getClient();

  for (const key of keys) {
    try {
      results[key] = await client.getBooleanValue(key, false, evalCtx);
    } catch {
      results[key] = false;
    }
  }

  return results;
}

/**
 * Evaluate ALL known flags for the given context.
 * Returns a Record<flagKey, boolean>.
 *
 * Loads flag keys from KV to discover all available flags,
 * then evaluates each through OpenFeature.
 */
export const getAllFlags = defineCachedFunction(
  async (context?: FlagContext) => {
    try {
      // Load all flag keys from KV to know what to evaluate
      const kv = useKV();
      const raw = await kv.get<string>(KV_FLAGS_KEY);
      if (!raw) return {};

      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const keys = getRecordKeys(parsed);
      return evaluateFlags(keys, context);
    } catch (error) {
      console.warn('[FeatureFlags] Failed to get all flags, returning empty:', error);
      return {};
    }
  },
  {
    name: 'getAllFlags',
    getKey: (context?: FlagContext) => {
      if (!context) return 'anon';
      return `${context.userId || 'anon'}:${context.isAdmin ? 'admin' : 'user'}:${context.tier || 'free'}`;
    },
    maxAge: 60 * 60 * 24, // 24 hours
  },
);

export async function clearAllFlagsCache() {
  const keys = await useStorage('cache').getKeys('nitro:functions:getAllFlags:');
  for (const key of keys) {
    await useStorage('cache').removeItem(key);
  }
}
