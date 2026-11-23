export interface AuthMethodProps {
  mode: 'login' | 'register';
  redirectTo: string;
  pending: boolean;
  rememberedUsername?: string;
}

export interface AuthMethodEmits {
  done: [redirect: string];
  pending: [pending: boolean];
  error: [message: string];
}

export interface AuthMethodEmitter {
  (event: 'done', ...args: AuthMethodEmits['done']): void;
  (event: 'pending', ...args: AuthMethodEmits['pending']): void;
  (event: 'error', ...args: AuthMethodEmits['error']): void;
}

/**
 * Props passed to `auth:login:alternatives` entries (e.g. inside the password
 * `<form>`). Buttons must be `type="button"` so they do not submit the form.
 */
export interface LoginAlternativeProps {
  /** What the user has typed into the username field so far. */
  username: string;
  /** Same-origin path to continue to once the user is signed in. */
  redirectTo: string;
  /** True while any sign-in on the page is in progress. */
  pending: boolean;
}

export interface LoginAlternativeSlots {
  default?: (props: { signIn: () => Promise<void> }) => unknown;
}

export interface LoginAlternativeEmits {
  /** The user is signed in; the page loads `redirect`. */
  done: [redirect: string];
  /** A sign-in started (true) or stopped (false); the page disables its form meanwhile. */
  pending: [pending: boolean];
  /** Shown in the page's error alert. */
  error: [message: string];
}
