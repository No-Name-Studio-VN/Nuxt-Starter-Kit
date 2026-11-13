declare module '#auth-utils' {
  interface SecureSessionData {
    /** Set by a password sign-in that still has to pass the authenticator code. */
    pending2faUserId?: number;
  }
}

export {};
