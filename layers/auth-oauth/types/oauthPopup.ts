export interface OAuthPopupOptions {
  action?: 'login' | 'link';
  onComplete?: (target: URL, provider: string) => boolean;
  onBlocked?: () => void;
  onTimeout?: () => void;
  onError?: (error: unknown) => void;
}

export interface OAuthPopupAttempt {
  provider: string;
  popup: Window | null;
  completionDeadline?: number;
}
