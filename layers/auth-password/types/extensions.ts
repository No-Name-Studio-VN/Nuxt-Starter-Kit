export {};

declare module '~~/types/extensions' {
  interface ExtensionSlots {
    /** Other ways to sign in, rendered under the password sign-in button. */
    'auth:login:alternatives': true;
  }
}
