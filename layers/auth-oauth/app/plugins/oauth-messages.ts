import { registerAuthMessages } from '#layers/auth/shared/constants/authMessages';
import { OAUTH_ERROR_MESSAGES, OAUTH_SUCCESS_MESSAGES } from '../../shared/constants/oauthMessages';

export default defineNuxtPlugin(() => {
  registerAuthMessages({ errors: OAUTH_ERROR_MESSAGES, success: OAUTH_SUCCESS_MESSAGES });
});
