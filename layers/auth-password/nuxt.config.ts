import { authRoutes } from '../auth/shared/authRoutes';
import { passwordRoutes } from './shared/passwordRoutes';
import type {} from '../../types/botProtection';

export default defineNuxtConfig({
  routeRules: {
    [passwordRoutes.AUTH_LOGIN_PASSWORD]: { botProtection: { redirect: authRoutes.AUTH_LOGIN } },
    [passwordRoutes.AUTH_REGISTER_PASSWORD]: { botProtection: { redirect: passwordRoutes.AUTH_REGISTER } },
    [passwordRoutes.AUTH_FORGOT_PASSWORD_REQUEST]: { botProtection: true },
  },
  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },
});
