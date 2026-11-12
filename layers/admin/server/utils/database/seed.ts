import { eq } from 'drizzle-orm';
import { runSeedTasks } from '#layers/admin/server/utils/seedTasks';
import type { SeedAdminResult, SeedSummary, SeedTaskResult } from '#layers/admin/types/seedTasks';

async function seedAdmin(defaultAdminPassword: string): Promise<SeedAdminResult> {
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

/** Creates the admin account, then runs every registered seed task. */
export async function seedDatabase(
  defaultAdminPassword: string,
): Promise<{ summary: SeedSummary; tasks: SeedTaskResult[] }> {
  const summary: SeedSummary = {
    admin: await seedAdmin(defaultAdminPassword),
  };

  // registerSeedTask() keeps every key unique and off 'admin'.
  const tasks = await runSeedTasks();
  for (const task of tasks) {
    summary[task.key] = task.counts;
  }

  return { summary, tasks };
}
