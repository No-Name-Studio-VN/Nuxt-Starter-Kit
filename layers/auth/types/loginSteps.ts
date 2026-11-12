/**
 * Props the login page passes to the `auth:login:steps` entry whose id matches
 * `?step=`. The step renders its own heading, form and cancel action in place
 * of the password form.
 */
export interface LoginStepProps {
  /** Same-origin path to continue to once the user is signed in. */
  redirectTo: string;
}

export interface LoginStepEmits {
  /** The user is signed in; the page loads `redirect`. */
  done: [redirect: string];
  /** The user left the step; the page goes back to the password form. */
  cancel: [];
}

/** Props the login page passes to every `auth:login:alternatives` entry. */
export interface LoginAlternativeProps {
  /** What the user has typed into the username field so far. */
  username: string;
  /** Same-origin path to continue to once the user is signed in. */
  redirectTo: string;
  /** True while any sign-in on the page is in progress. */
  pending: boolean;
}

export interface LoginAlternativeEmits {
  /** The user is signed in; the page loads `redirect`. */
  done: [redirect: string];
  /** A sign-in started (true) or stopped (false); the page disables its form meanwhile. */
  pending: [pending: boolean];
  /** Shown in the page's error alert. */
  error: [message: string];
}
