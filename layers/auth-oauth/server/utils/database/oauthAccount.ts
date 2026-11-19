import { and, count, eq, inArray } from 'drizzle-orm';
import type { OAuthLinkInput } from '#layers/auth-oauth/types/oauth';

class OAuthAccountService {
  private static instance: OAuthAccountService;

  private get db() {
    return useDB();
  }

  public static getInstance(): OAuthAccountService {
    if (!OAuthAccountService.instance) {
      OAuthAccountService.instance = new OAuthAccountService();
    }
    return OAuthAccountService.instance;
  }

  /**
   * Find a linked account by provider + provider account ID
   */
  async getByProviderAccount(provider: string, providerAccountId: string) {
    return this.db
      .select()
      .from(tables.oauthAccounts)
      .where(
        and(
          eq(tables.oauthAccounts.provider, provider),
          eq(tables.oauthAccounts.providerAccountId, providerAccountId),
        ),
      )
      .get();
  }

  /**
   * Check if a user already has a specific provider linked
   */
  async getByUserAndProvider(userId: number, provider: string) {
    return this.db
      .select()
      .from(tables.oauthAccounts)
      .where(
        and(eq(tables.oauthAccounts.userId, userId), eq(tables.oauthAccounts.provider, provider)),
      )
      .get();
  }

  /**
   * Link an OAuth provider to a user
   */
  async link(data: OAuthLinkInput) {
    return this.db
      .insert(tables.oauthAccounts)
      .values({
        userId: data.userId,
        provider: data.provider,
        providerAccountId: data.providerAccountId,
        email: data.email ?? null,
        name: data.name ?? null,
        avatarUrl: data.avatarUrl ?? null,
      })
      .returning()
      .get();
  }

  /**
   * Unlink an OAuth provider from a user
   */
  async unlink(userId: number, provider: string) {
    return this.db
      .delete(tables.oauthAccounts)
      .where(
        and(eq(tables.oauthAccounts.userId, userId), eq(tables.oauthAccounts.provider, provider)),
      );
  }

  async countByUserId(userId: number, readyProviders: string[]): Promise<number> {
    if (!readyProviders.length) return 0;

    const row = await this.db
      .select({ count: count() })
      .from(tables.oauthAccounts)
      .where(
        and(
          eq(tables.oauthAccounts.userId, userId),
          inArray(tables.oauthAccounts.provider, readyProviders),
        ),
      )
      .get();
    return row?.count ?? 0;
  }
}

export default OAuthAccountService.getInstance();
