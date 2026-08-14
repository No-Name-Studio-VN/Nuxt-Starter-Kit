import type {
  Provider,
  ResolutionDetails,
  EvaluationContext,
  JsonValue,
  Logger,
} from '@openfeature/server-sdk';
import type { CachedFlagConfig, FeatureFlagRules, FeatureFlagTier } from '~~/types/featureFlags';
import { KV_FLAGS_KEY } from '#shared/constants/flags';

/**
 * In-memory cache to avoid redundant KV reads per-request.
 */
let cachedConfig: Record<string, CachedFlagConfig> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFeatureFlagTier(value: unknown): value is FeatureFlagTier {
  return value === 'free' || value === 'premium';
}

function isFeatureFlagRules(value: unknown): value is FeatureFlagRules {
  if (!isRecord(value)) {
    return false;
  }

  const allowedUserIds = value.allowedUserIds;
  if (
    allowedUserIds !== undefined &&
    (!Array.isArray(allowedUserIds) || allowedUserIds.some((userId) => typeof userId !== 'number'))
  ) {
    return false;
  }

  const allowedTiers = value.allowedTiers;
  if (
    allowedTiers !== undefined &&
    (!Array.isArray(allowedTiers) || allowedTiers.some((tier) => !isFeatureFlagTier(tier)))
  ) {
    return false;
  }

  const allowedRegions = value.allowedRegions;
  if (
    allowedRegions !== undefined &&
    (!Array.isArray(allowedRegions) || allowedRegions.some((region) => typeof region !== 'string'))
  ) {
    return false;
  }

  return value.adminOnly === undefined || typeof value.adminOnly === 'boolean';
}

function isCachedFlagConfig(value: unknown): value is CachedFlagConfig {
  if (!isRecord(value)) {
    return false;
  }

  const rules = value.rules;
  return (
    typeof value.enabled === 'boolean' &&
    typeof value.rolloutPct === 'number' &&
    (rules === null || rules === undefined || isFeatureFlagRules(rules))
  );
}

function isCachedFlagConfigRecord(value: unknown): value is Record<string, CachedFlagConfig> {
  return isRecord(value) && Object.values(value).every(isCachedFlagConfig);
}

/**
 * OpenFeature-compliant provider backed by Cloudflare KV.
 *
 * Wraps the existing D1 → KV flag evaluation engine so that all
 * flag evaluations go through the standard OpenFeature API.
 *
 * @example
 * ```ts
 * import { OpenFeature } from '@openfeature/server-sdk'
 * OpenFeature.setProvider(new KVFeatureFlagProvider())
 *
 * const client = OpenFeature.getClient()
 * const enabled = await client.getBooleanValue('source-gromet', true)
 * ```
 */
export class KVFeatureFlagProvider implements Provider {
  readonly metadata = { name: 'kv-feature-flags' };

  // ── Resolution methods ────────────────────────────────────────

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    const config = await this.loadFlagConfig();
    const flag = config[flagKey];

    if (!flag) {
      return { value: defaultValue, reason: 'DEFAULT', variant: 'default' };
    }

    if (!flag.enabled) {
      return { value: false, reason: 'DISABLED', variant: 'off' };
    }

    // Evaluate targeting rules
    if (flag.rules && !this.matchesRules(flag.rules, context)) {
      return { value: false, reason: 'TARGETING_MATCH', variant: 'off' };
    }

    // Percentage rollout
    if (flag.rolloutPct < 100) {
      const userId = context.targetingKey ? Number(context.targetingKey) : undefined;
      if (!userId) {
        return { value: false, reason: 'DEFAULT', variant: 'off' };
      }
      const bucket = this.deterministicBucket(flagKey, userId);
      if (bucket >= flag.rolloutPct) {
        return { value: false, reason: 'SPLIT', variant: 'off' };
      }
    }

    return { value: true, reason: 'TARGETING_MATCH', variant: 'on' };
  }

  async resolveStringEvaluation(
    _flagKey: string,
    defaultValue: string,
    _context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    // String flags not supported — return default
    return { value: defaultValue, reason: 'DEFAULT' };
  }

  async resolveNumberEvaluation(
    _flagKey: string,
    defaultValue: number,
    _context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    // Number flags not supported — return default
    return { value: defaultValue, reason: 'DEFAULT' };
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    _flagKey: string,
    defaultValue: T,
    _context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    // Object flags not supported — return default
    return { value: defaultValue, reason: 'DEFAULT' };
  }

  // ── Internal helpers ──────────────────────────────────────────

  private async loadFlagConfig(): Promise<Record<string, CachedFlagConfig>> {
    const now = Date.now();
    if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
      return cachedConfig;
    }

    try {
      const kv = useKV();
      const raw = await kv.get<string>(KV_FLAGS_KEY);
      if (!raw) return {};

      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!isCachedFlagConfigRecord(parsed)) {
        return {};
      }

      cachedConfig = parsed;
      cacheTimestamp = now;
      return parsed;
    } catch (error) {
      console.warn('[KVFeatureFlagProvider] Failed to load config from KV:', error);
      return {};
    }
  }

  private deterministicBucket(flagKey: string, userId: number): number {
    const input = `${flagKey}:${userId}`;
    // eslint-disable-next-line unicorn/number-literal-case
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return Math.abs(hash) % 100;
  }

  private matchesRules(rules: FeatureFlagRules, context: EvaluationContext): boolean {
    if (rules.adminOnly && !context.isAdmin) return false;

    if (rules.allowedUserIds?.length) {
      const userId = context.targetingKey ? Number(context.targetingKey) : undefined;
      if (!userId || !rules.allowedUserIds.includes(userId)) return false;
    }

    if (rules.allowedTiers?.length) {
      if (!isFeatureFlagTier(context.tier) || !rules.allowedTiers.includes(context.tier))
        return false;
    }

    if (rules.allowedRegions?.length) {
      const region = context.region;
      if (typeof region !== 'string') return false;
      if (!region || !rules.allowedRegions.includes(region)) return false;
    }

    return true;
  }
}
