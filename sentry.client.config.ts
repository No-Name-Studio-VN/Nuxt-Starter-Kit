import { init, replayIntegration, piniaIntegration } from '@sentry/nuxt';

// check if we are running in a Vitest environment to avoid initializing Sentry during tests
const isVitest = process.env.VITEST === 'true';
if (!isVitest) {
  init({
    dsn: useRuntimeConfig().public.sentry.dsn,

    // We recommend adjusting this value in production, or using tracesSampler
    // for finer control
    tracesSampleRate: !import.meta.dev ? 0.1 : 1.0,

    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: !import.meta.dev ? 0.1 : 1.0,
    // If the entire session is not sampled, use the below sample rate to sample
    // sessions when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    integrations: [replayIntegration(), piniaIntegration(usePinia())],
    normalizeDepth: 10,

    // Preserve automatic user information collection with Sentry v11.
    dataCollection: { userInfo: true },

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
  });
}
