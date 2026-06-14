import { eq } from 'drizzle-orm'
import type { DBUserTwoFactor } from '#shared/db'

interface CreateUserTwoFactorInput {
  userId: number
  totpSecret?: string | null
  totpEnabled?: boolean
  backupCodes?: string[] | null
  failedAttempts?: number
  lastFailedAttempt?: Date | null
}

interface UpdateUserTwoFactorInput extends CreateUserTwoFactorInput {
  userId: number
}

class UserTwoFactorService {
  private static instance: UserTwoFactorService

  private get db() {
    return useDB()
  }

  public static getInstance(): UserTwoFactorService {
    if (!UserTwoFactorService.instance) {
      UserTwoFactorService.instance = new UserTwoFactorService()
    }
    return UserTwoFactorService.instance
  }

  async getByUserId(userId: number): Promise<DBUserTwoFactor | undefined> {
    const twoFactor = await this.db
      .select()
      .from(tables.userTwoFactor)
      .where(eq(tables.userTwoFactor.userId, userId))
      .get()

    return twoFactor
  }

  async create(data: CreateUserTwoFactorInput): Promise<DBUserTwoFactor> {
    const twoFactor = await this.db
      .insert(tables.userTwoFactor)
      .values(data)
      .returning()
      .get()

    return twoFactor
  }

  async update(data: UpdateUserTwoFactorInput): Promise<DBUserTwoFactor> {
    const { userId, ...updates } = data
    const twoFactor = await this.db
      .update(tables.userTwoFactor)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tables.userTwoFactor.userId, userId))
      .returning()
      .get()

    return twoFactor
  }

  async upsert(data: CreateUserTwoFactorInput): Promise<DBUserTwoFactor> {
    const existing = await this.getByUserId(data.userId)
    if (existing) {
      return this.update(data)
    }

    return this.create(data)
  }
}

export default UserTwoFactorService.getInstance()
