import type { tables } from '#layers/database/server/utils/db';
import type { LoginPolicyOutcome } from '#layers/auth/types/loginPolicies';
import type { OAuthProviderId } from './providers';

export interface OAuthSignInEvidence {
  provider: OAuthProviderId;
  providerAccountId: string;
  /** The email returned for this sign-in, not the address stored on the user. */
  email: string;
}

declare module '#layers/auth/types/signInMethods' {
  interface SignInMethodEvidence {
    oauth: OAuthSignInEvidence;
  }
}

export type DBOAuthAccount = typeof tables.oauthAccounts.$inferSelect;

export const OAUTH_POPUP_COMPLETE_STORAGE_KEY = 'oauth_popup_complete';
export const OAUTH_POPUP_COMPLETE_CHANNEL = 'oauth_popup_complete';

export interface OAuthPopupCompleteMessage {
  type: 'oauth:complete';
  url: string;
}

export interface OAuthUrlData {
  url: string;
}

export type OAuthUrlPayload = OAuthUrlData;

export interface OAuthUnlinkPayload {
  unlinked: true;
}

export type GoogleOneTapStatus = 'signed-in' | 'created';

export interface GoogleOneTapPayload {
  authenticated: true;
  status: GoogleOneTapStatus;
}

export type OAuthLoginCompletionResult =
  | {
      status: GoogleOneTapStatus;
      userId: number;
      /** Only `continue` wrote a session; the caller answers the others. */
      outcome: LoginPolicyOutcome;
    }
  | {
      status: 'missing-user';
    }
  | {
      status: 'email-in-use';
    };

export interface OAuthLinkInput {
  userId: number;
  provider: OAuthProviderId;
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}
