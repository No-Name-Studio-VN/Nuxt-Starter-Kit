import { eq } from 'drizzle-orm';
// <nsk:feature-flags>
import { TEXT_OBFUSCATION_FLAG } from '#shared/constants/flags';
import featureFlagService from '~~/server/utils/database/featureFlag';
// </nsk:feature-flags>

interface SeedSummary {
  admin: {
    created: boolean;
    verified: boolean;
    username: string;
  };
  // <nsk:feature-flags>
  featureFlags: {
    created: number;
    skipped: number;
  };
  // </nsk:feature-flags>
}

// <nsk:feature-flags>
interface SeedFeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPct: number;
  owner: string;
}

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
// </nsk:feature-flags>

async function seedAdmin(defaultAdminPassword: string): Promise<SeedSummary['admin']> {
  const db = useDB();
  const adminUsername = 'admin';
  const existingAdmin = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.username, adminUsername))
    .get();

  if (existingAdmin) {
    if (existingAdmin.isAdmin && !existingAdmin.emailVerified) {
      await db
        .update(tables.users)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(tables.users.id, existingAdmin.id));

      return { created: false, verified: true, username: existingAdmin.username };
    }

    return {
      created: false,
      verified: existingAdmin.emailVerified,
      username: existingAdmin.username,
    };
  }

  const hashedPassword = await hashPassword(defaultAdminPassword);
  const [newAdmin] = await db
    .insert(tables.users)
    .values({
      username: adminUsername,
      name: 'Administrator',
      email: 'admin@nnsvn.me',
      password: hashedPassword,
      emailVerified: true,
      isAdmin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
    })
    .returning();

  if (!newAdmin) throw new Error('Failed to create admin account');

  return { created: true, verified: true, username: newAdmin.username };
}

// <nsk:feature-flags>
export async function seedDefaultFeatureFlags(): Promise<SeedSummary['featureFlags']> {
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
// </nsk:feature-flags>

export async function seedDatabase(defaultAdminPassword: string): Promise<SeedSummary> {
  return {
    admin: await seedAdmin(defaultAdminPassword),
    // <nsk:feature-flags>
    featureFlags: await seedDefaultFeatureFlags(),
    // </nsk:feature-flags>
  };
}
