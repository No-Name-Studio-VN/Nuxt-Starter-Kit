import type { H3Event } from 'h3';

export interface BotProtectionOptions {
  provider: string;
  routes: string[];
}

export type BotProtectionResult =
  | { ok: true }
  | { ok: false; reason: 'missing-token' | 'invalid-token' | 'unavailable' };

export type BotProtectionProvider = (input: {
  event: H3Event;
  token: string;
}) => boolean | Promise<boolean>;

declare module '@nuxt/schema' {
  interface NuxtConfig {
    botProtection?: Partial<BotProtectionOptions>;
  }

  interface RuntimeConfig {
    botProtection: { provider: string };
  }
}
