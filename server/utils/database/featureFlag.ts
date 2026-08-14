import { eq, desc, inArray } from 'drizzle-orm';
import type { DBFeatureFlag } from '#shared/db';
import type { FeatureFlagInput, FeatureFlagUpdateInput } from '#shared/schemas/featureFlagSchema';
import { IDatabaseService } from '~~/types/db/database-service';
import type { CachedFlagConfig, FeatureFlagAuditEntryInput } from '~~/types/featureFlags';
import { KV_FLAGS_KEY } from '#shared/constants/flags';
import { clearAllFlagsCache } from '~~/server/utils/featureFlags';

export type { CachedFlagConfig } from '~~/types/featureFlags';

class FeatureFlagService extends IDatabaseService<DBFeatureFlag> {
  private static instance: FeatureFlagService;

  private get db() {
    return useDB();
  }

  public static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService();
    }
    return FeatureFlagService.instance;
  }

  /**
   * Get a flag by its key
   */
  async getById(key: string): Promise<DBFeatureFlag | undefined> {
    return this.db.select().from(tables.featureFlags).where(eq(tables.featureFlags.key, key)).get();
  }

  /**
   * Alias for getById — more readable in flag context
   */
  async getByKey(key: string): Promise<DBFeatureFlag | undefined> {
    return this.getById(key);
  }

  /**
   * Get all flags ordered by creation date (newest first)
   */
  async getList(): Promise<DBFeatureFlag[]> {
    return this.db
      .select()
      .from(tables.featureFlags)
      .orderBy(desc(tables.featureFlags.createdAt))
      .all();
  }

  /**
   * Create a new feature flag and sync to KV
   */
  async create(data: FeatureFlagInput): Promise<DBFeatureFlag> {
    const flag = await this.db.insert(tables.featureFlags).values(data).returning().get();

    await this.syncToKV();
    return flag;
  }

  /**
   * Update an existing feature flag and sync to KV
   */
  async update(data: FeatureFlagUpdateInput & { key: string }): Promise<DBFeatureFlag> {
    const updatedFlag = await this.db
      .update(tables.featureFlags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tables.featureFlags.key, data.key))
      .returning()
      .get();

    await this.syncToKV();
    return updatedFlag;
  }

  /**
   * Delete a flag by key and sync to KV
   */
  async delete(key: string): Promise<void> {
    const flag = await this.getByKey(key);
    if (!flag) {
      throw new Error(`Feature flag "${key}" not found`);
    }

    await this.db.delete(tables.featureFlags).where(eq(tables.featureFlags.key, key));

    await this.syncToKV();
  }

  /**
   * Delete multiple flags by keys and sync to KV
   */
  async bulkDelete(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    await this.db.delete(tables.featureFlags).where(inArray(tables.featureFlags.key, keys));

    await this.syncToKV();
  }

  /**
   * Bulk upsert flags for import. Inserts new flags, updates existing ones.
   * Syncs to KV once at the end for performance.
   *
   * @returns Summary of what was imported
   */
  async bulkUpsert(flagsData: FeatureFlagInput[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const data of flagsData) {
      const existing = await this.getByKey(data.key);
      if (existing) {
        await this.db
          .update(tables.featureFlags)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(tables.featureFlags.key, data.key));
        updated++;
      } else {
        await this.db.insert(tables.featureFlags).values(data);
        created++;
      }
    }

    await this.syncToKV();
    return { created, updated };
  }

  /**
   * Write an audit log entry for a flag change.
   */
  async logAudit(entry: FeatureFlagAuditEntryInput): Promise<void> {
    await this.db.insert(tables.featureFlagAuditLog).values({
      flagKey: entry.flagKey,
      action: entry.action,
      actorId: entry.actorId ?? null,
      previousValue: entry.previousValue ?? null,
      newValue: entry.newValue ?? null,
    });
  }

  /**
   * Sync all flag definitions to KV as a single JSON blob.
   * Called automatically after every write operation.
   *
   * The cached format strips metadata and keeps only what the
   * evaluation engine needs — enabled state, rules, and rollout %.
   */
  async syncToKV(): Promise<void> {
    const flags = await this.getList();

    const config: Record<string, CachedFlagConfig> = {};
    for (const flag of flags) {
      config[flag.key] = {
        enabled: flag.enabled,
        rules: flag.rules,
        rolloutPct: flag.rolloutPct,
      };
    }
    await Promise.allSettled([
      useKV().set(KV_FLAGS_KEY, JSON.stringify(config)),
      clearAllFlagsCache(),
    ]);
  }
}

export default FeatureFlagService.getInstance();
