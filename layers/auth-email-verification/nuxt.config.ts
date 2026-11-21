import { emailVerificationRoutes } from './shared/emailVerificationRoutes';
import type {} from '../../types/botProtection';

export default defineNuxtConfig({
  routeRules: {
    [emailVerificationRoutes.AUTH_RESEND_VERIFICATION]: { botProtection: true },
  },
  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },
});
