import type { SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { OnboardingPendingInput } from '#layers/auth/types/onboarding';
import type { CreateUserInput, UserUpdateInput } from '#layers/auth/shared/schemas/userSchema';
import type { User } from '#layers/auth/types/auth';
import type { LoginPolicyContext } from '#layers/auth/types/loginPolicies';

/**
 * One way to sign in (for example, password or a passkey). Each method layer
 * registers its entry from a Nitro plugin.
 */
export interface SignInMethod {
  id: string;
  /** How many ways in this method gives the user, e.g. linked accounts or passkeys. */
  countCredentials(userId: number): Promise<number>;
  /** Scalar count in the same SQLite statement as a credential deletion. */
  countCredentialsQuery?(userId: number, excludeCredentialId?: string): SQL<number>;
  verifySecret?(userId: number, secret: string): Promise<boolean>;
  getCredentialUpdatedAt?(userId: number): Promise<Date | null>;
  buildEmailChangeCleanup?(userId: number): BatchItem<'sqlite'>;
  buildUnverifiedEmailResetCleanup?(userId: number, redeemable: SQL): EmailResetCleanup;
  resolveSessionPresentation?(evidence: SignInEvidence): Promise<SessionPresentation>;
  /** Replaces the user's secret, for methods that have one (password). */
  setSecret?(userId: number, secret: string): Promise<void>;
  /** Creates the user and their first credential together. */
  createWithSecret?(data: CreateUserInput & OnboardingPendingInput, secret: string): Promise<User>;
  /** Saves the profile and replacement credential together, if the user exists. */
  updateWithSecret?(data: UserUpdateInput, secret: string, cleanup?: BatchItem<'sqlite'>): Promise<User | undefined>;
}

/** Method layers augment this interface with evidence specific to their sign-ins. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- sign-in methods own their evidence
export interface SignInMethodEvidence {}

/** What a sign-in proved, handed to the `auth:signed-in` hook. */
export interface SignInEvidence extends Partial<SignInMethodEvidence> {
  user: User;
  method: string;
}

export type CompleteSignInOptions = Omit<SignInEvidence, 'user'> &
  Pick<LoginPolicyContext, 'redirectTo'> & {
    /** Runs after policies allow sign-in, before hooks or session writes. */
    beforeFinish?: () => Promise<void>;
  };

export interface SignInCredential {
  methodId: string;
  credentialId: string;
}

export interface SessionPresentation {
  avatarUrl?: string | null;
  provider?: string;
}

export type EmailResetCleanup = BatchItem<'sqlite'> & {
  readonly _: { readonly result: { id: number }[] };
};
