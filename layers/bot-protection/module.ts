import { addPlugin, createResolver, defineNuxtModule, extendRouteRules, installModule, useLogger } from '@nuxt/kit';
import { TURNSTILE_TEST_SITE_KEY } from './shared/constants/turnstile';
import type { BotProtectionOptions } from './types/botProtection';
import type {} from '../../types/botProtection';

export default defineNuxtModule<BotProtectionOptions>({
  meta: { name: 'kit-bot-protection', configKey: 'botProtection' },
  defaults: { provider: 'turnstile', routes: [] },
  async setup(options, nuxt) {
    for (const route of options.routes) {
      extendRouteRules(route, { botProtection: true });
    }

    const { runtimeConfig } = nuxt.options;
    runtimeConfig.botProtection = { provider: options.provider };
    runtimeConfig.public.botProtection = { provider: options.provider, devTestKeys: false };
    if (options.provider !== 'turnstile') return;

    const siteKey = process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.NUXT_TURNSTILE_SITE_KEY || '';
    const devTestKeys = nuxt.options.dev && (!siteKey || !process.env.NUXT_TURNSTILE_SECRET_KEY);
    if (devTestKeys) {
      useLogger('bot-protection').warn('Turnstile keys are incomplete; using the always-pass test pair in development.');
    }

    runtimeConfig.public.botProtection.devTestKeys = devTestKeys;
    runtimeConfig.public.turnstile = { siteKey: devTestKeys ? TURNSTILE_TEST_SITE_KEY : siteKey };
    // Declare the runtime binding without embedding a production secret in the build.
    runtimeConfig.turnstile = { secretKey: '' };
    await installModule('@nuxtjs/turnstile');
    addPlugin(createResolver(import.meta.url).resolve('./app/widgets/turnstile-widget'));
  },
});
