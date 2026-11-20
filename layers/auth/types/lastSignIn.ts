import type { UserSession } from '#auth-utils';
import type { z } from 'zod';
import type { lastSignInSchema } from '#layers/auth/shared/schemas/lastSignInSchema';
import type { OAuthProviderInfo } from '#layers/auth/types/auth';

export type LastSignIn = z.infer<typeof lastSignInSchema>;
export type SignInMethod = LastSignIn['method'];

export type CompletedSignIn =
  | { method: 'password' | 'passkey' }
  | { method: 'oauth'; provider: string; avatarUrl?: string };

export interface LastSignInSession extends Pick<UserSession, 'loginMethod' | 'loginProvider' | 'loginMethodAt'> {
  user?: {
    username: string;
    name: string;
    avatarUrl?: string;
  } | null;
}

export type LastSignInStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export type LastSignInMode = 'auto' | 'form' | 'password';
export type LastSignInView = 'placeholder' | 'tile' | 'form';

export interface LastSignInViewOptions {
  mounted: boolean;
  hasStep: boolean;
  hasMessage: boolean;
  mode: LastSignInMode;
  record: LastSignIn | null;
  providerStatus: 'idle' | 'pending' | 'success' | 'error';
  providerEnabled: boolean;
  passkeyAvailable: boolean;
}

export interface LastSignInTileProps {
  record: LastSignIn;
  provider?: OAuthProviderInfo;
  pending?: boolean;
}

export interface LastSignInTileEmits {
  continue: [];
  alternate: [];
  forget: [];
}
