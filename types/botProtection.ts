import type { Ref } from 'vue';

export interface FormChallengeState {
  provider: string | undefined;
  token: Readonly<Ref<string>>;
  attempt: Readonly<Ref<number>>;
  setToken: (value: string) => void;
}

export interface FormChallengeError {
  code: string;
  details: Record<string, unknown>;
}

export interface BotProtectionPublicConfig {
  provider: string;
  devTestKeys: boolean;
}

declare module '@nuxt/schema' {
  interface PublicRuntimeConfig {
    botProtection?: BotProtectionPublicConfig;
  }
}

declare module 'nitropack/types' {
  interface NitroRouteConfig {
    botProtection?: boolean | { redirect: string };
  }
}

declare module 'nitropack' {
  interface NitroRouteConfig {
    botProtection?: boolean | { redirect: string };
  }
}
