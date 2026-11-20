import { browserFallbackLocale, locales } from '~~/i18n-constants';

export default defineNuxtPlugin({
  dependsOn: ['i18n:plugin'],
  hooks: {
    'i18n:beforeLocaleSwitch'(change) {
      if (!change.initialSetup) return;

      const { $i18n, $router, isHydrating, payload } = useNuxtApp();
      if ($router.currentRoute.value.meta.localeIndependent !== true) return;
      if (import.meta.client && isHydrating && payload.serverRendered) return;

      // Browser detection only runs at the public root. On a shared URL,
      // load the preferred locale on SSR or on a client-only entry.
      const preferred = $i18n.getLocaleCookie() || $i18n.getBrowserLocale();
      change.newLocale = locales.find((locale) => locale === preferred) ?? browserFallbackLocale;
    },
  },
});
