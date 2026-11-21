import { normalizeEmail } from '#shared/utils/normalizeEmail';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { SafeUser, User } from '#layers/auth/types/auth';
import type { OnboardingPendingInput } from '#layers/auth/types/onboarding';
import { getSignInMethod } from '#layers/auth/server/utils/signInMethods';
import { databaseValues } from '#layers/database/server/utils/databaseValues';
import { IDatabaseService } from '#layers/database/types/db/database-service';
import type { CreateUserInput, UserUpdateInput } from '#layers/auth/shared/schemas/userSchema';

function emailMatches(email: string) {
  return sql`lower(${tables.users.email}) = ${normalizeEmail(email)}`;
}

class UserService extends IDatabaseService<SafeUser> {
  private static instance: UserService;

  private get db() {
    return useDB();
  }

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /**
   * Get a user by their ID (with caching)
   */
  async getById(id: number): Promise<User | undefined> {
    const user = await this.db.select().from(tables.users).where(eq(tables.users.id, id)).get();

    return user;
  }

  /**
   * Get a user by their username
   */
  async getByUsername(username: string): Promise<User | undefined> {
    const user = await this.db
      .select()
      .from(tables.users)
      .where(eq(tables.users.username, username))
      .get();

    return user;
  }

  /**
   * Get a user by their email
   */
  async getByEmail(email: string): Promise<User | undefined> {
    return this.db.select().from(tables.users).where(emailMatches(email)).limit(1).get();
  }

  async listByEmail(email: string): Promise<User[]> {
    return this.db.select().from(tables.users).where(emailMatches(email)).all();
  }

  /**
   * Get all users
   */
  async getList(): Promise<SafeUser[]> {
    // Keep this allowlist explicit so new secret columns cannot reach clients.
    const users = await this.db
      .select({
        id: tables.users.id,
        username: tables.users.username,
        name: tables.users.name,
        email: tables.users.email,
        emailVerified: tables.users.emailVerified,
        isAdmin: tables.users.isAdmin,
        isLocked: tables.users.isLocked,
        lastLoginAt: tables.users.lastLoginAt,
        createdAt: tables.users.createdAt,
        updatedAt: tables.users.updatedAt,
      })
      .from(tables.users)
      .all();

    return users;
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserInput & OnboardingPendingInput) {
    const newUser = await this.db.insert(tables.users).values(data).returning().get();

    return newUser;
  }

  async createIfEmailAvailable(data: CreateUserInput) {
    return this.db
      .insert(tables.users)
      .values(data)
      .onConflictDoNothing({ target: tables.users.email })
      .returning()
      .get();
  }

  /**
   * Update a user by their ID
   */
  async update(data: UserUpdateInput & OnboardingPendingInput) {
    const updatedUser = await this.db
      .update(tables.users)
      .set(data)
      .where(eq(tables.users.id, data.id))
      .returning()
      .get();

    return updatedUser;
  }

  async completeOnboardingStep(id: number, stepId: string): Promise<User | undefined> {
    const { onboardingCompletedSteps } = tables.users;
    // Append in SQL so concurrent requests cannot overwrite or duplicate progress.
    const updatedUser = await this.db
      .update(tables.users)
      .set({ onboardingCompletedSteps: sql`json_insert(${onboardingCompletedSteps}, '$[#]', ${stepId})` })
      .where(and(
        eq(tables.users.id, id),
        sql`not exists (select 1 from json_each(${onboardingCompletedSteps}) where value = ${stepId})`,
      ))
      .returning()
      .get();

    return updatedUser ?? this.getById(id);
  }

  async updateEmail(
    id: number,
    email: string,
    changes: Omit<UserUpdateInput, 'id' | 'email' | 'emailVerified'>,
  ): Promise<User | undefined> {
    const update = this.db
      .update(tables.users)
      .set({
        ...changes,
        email,
        emailVerified: false,
      })
      .where(eq(tables.users.id, id))
      .returning();

    // Clear outstanding links and their resend cooldowns in the same write batch.
    const cleanup = getSignInMethod('password')?.buildEmailChangeCleanup?.(id);
    if (!cleanup) return update.get();

    const [[updatedUser]] = await this.db.batch([update, cleanup]);
    return updatedUser;
  }

  /**
   * Delete a user by their ID
   */
  async delete(id: number): Promise<void> {
    await this.db.delete(tables.users).where(eq(tables.users.id, id));
  }

  /**
   * Delete multiple users by their IDs
   */
  async bulkDelete(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];

    const deletedUsers = await this.db
      .delete(tables.users)
      .where(inArray(tables.users.id, databaseValues(ids)))
      .returning({ id: tables.users.id })
      .execute();

    return deletedUsers.map(({ id }) => id);
  }
}

export default UserService.getInstance();
