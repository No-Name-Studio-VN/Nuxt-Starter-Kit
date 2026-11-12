import type { tables } from '#layers/database/server/utils/db';

export type User = typeof tables.users.$inferSelect;
export type DBLockScreen = typeof tables.userLockScreen.$inferSelect;
export type DBAuthToken = typeof tables.authTokens.$inferSelect;
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

export interface OAuthProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
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
    }
  | {
      status: 'missing-user';
    };

export interface OAuthProviderConfig {
  id: string;
  name: string;
  route: string;
}

export interface OAuthLinkInput {
  userId: number;
  provider: string;
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  isAdmin: boolean;
  skipLockOnInit?: boolean;
}

export type AuthErrorCode =
  | 'validation'
  | 'captcha'
  | 'existed'
  | 'email-existed'
  | 'unknown'
  | 'invalid-credentials'
  | 'reset-invalid-token'
  | 'reset-token-expired'
  | 'oauth-already-linked'
  | 'oauth-already-connected'
  | 'oauth-error'
  | 'not-authenticated'
  | 'unlink-last-method';

export type AuthSuccessCode =
  | 'oauth-linked'
  | 'oauth-unlinked'
  | 'password-reset'
  | 'reset-link-sent';

export interface AuthMessages {
  errors: Record<string, string>;
  success: Record<string, string>;
}
