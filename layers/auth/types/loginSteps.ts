/**
 * Props the login page passes to the `auth:login:steps` entry whose id matches
 * `?step=`. The step renders its own heading, form and cancel action in place
 * of the sign-in methods.
 */
export interface LoginStepProps {
  /** Same-origin path to continue to once the user is signed in. */
  redirectTo: string;
}

export interface LoginStepEmits {
  /** The user is signed in; the page loads `redirect`. */
  done: [redirect: string];
  /** The user left the step; the page goes back to the sign-in methods. */
  cancel: [];
}
