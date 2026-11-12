declare module '~~/types/extensions' {
  interface ExtensionSlots {
    /** Optional sidebar host; registering here does not require the auth layer. */
    'sidebar:footer': true;
  }
}

export {};
