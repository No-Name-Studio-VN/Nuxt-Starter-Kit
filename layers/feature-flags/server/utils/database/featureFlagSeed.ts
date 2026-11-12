import { eq } from 'drizzle-orm';
import { TEXT_OBFUSCATION_FLAG } from '#layers/feature-flags/shared/constants/flags';
import featureFlagService from '#layers/feature-flags/server/utils/database/featureFlag';
import type {
  FeatureFlagSeedSummary,
  SeedFeatureFlag,
} from '#layers/feature-flags/types/featureFlags';

function getDefaultFeatureFlags(): SeedFeatureFlag[] {
  return [
    {
      key: TEXT_OBFUSCATION_FLAG,
      description:
        'Controls whether the text obfuscation is enabled. Enabling will render UI texts in an illegible way. Ensure maximum security when demoing the app publicly.',
      enabled: false,
      rolloutPct: 100,
      owner: 'system',
    },
  ];
}

export async function seedDefaultFeatureFlags(): Promise<FeatureFlagSeedSummary> {
  const db = useDB();
  let created = 0;
  let skipped = 0;

  for (const flag of getDefaultFeatureFlags()) {
    const existingFlag = await db
      .select({ key: tables.featureFlags.key })
      .from(tables.featureFlags)
      .where(eq(tables.featureFlags.key, flag.key))
      .get();

    if (existingFlag) {
      skipped++;
      continue;
    }

    await db.insert(tables.featureFlags).values(flag);

    created++;
  }

  await featureFlagService.syncToKV();

  return { created, skipped };
}
