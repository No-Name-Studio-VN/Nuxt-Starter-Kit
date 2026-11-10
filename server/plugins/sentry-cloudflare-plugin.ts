import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

export default defineNitroPlugin(
  sentryCloudflareNitroPlugin({
    dsn: useRuntimeConfig().public.sentry.dsn,

    // We recommend adjusting this value in production, or using tracesSampler
    // for finer control
    tracesSampleRate: !import.meta.dev ? 0.1 : 1.0,

    // Preserve automatic user information collection with Sentry v11.
    dataCollection: { userInfo: true },

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
  }),
);
