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
  | 'email-not-verified'
  | 'invalid-token'
  | 'token-expired'
  | 'resend-too-soon'
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
  | 'email-verified'
  | 'password-reset'
  | 'verification-sent'
  | 'reset-link-sent';
