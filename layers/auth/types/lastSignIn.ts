import type { AuthMethodEmits } from './authMethods';
import type { UserSession } from '#auth-utils';
import type { z } from 'zod';
import type { lastSignInSchema } from '#layers/auth/shared/schemas/lastSignInSchema';

export type LastSignIn = z.infer<typeof lastSignInSchema>;
export type RememberedSignInMethodId = LastSignIn['method'];

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
  label: string;
  pending?: boolean;
}

export interface RememberedSignInProps {
  record: LastSignIn;
  redirectTo: string;
  pending: boolean;
}

export interface LastSignInTileEmits {
  continue: [];
  alternate: [];
  forget: [];
}

export interface RememberedSignInEmits extends AuthMethodEmits {
  alternate: [];
  forget: [];
  unavailable: [];
  continuePassword: [];
}
