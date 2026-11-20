import type { SQL } from 'drizzle-orm';

export interface SignInMethodSource {
  id: string;
  order: number;
  /** A scalar SQL count for this user, omitting the specified credential when provided. */
  count(userId: number, excludeId?: string): SQL<number>;
}

export type SignInMethodExclusion =
  | { provider: string }
  | { sourceId: string; credentialId: string };
