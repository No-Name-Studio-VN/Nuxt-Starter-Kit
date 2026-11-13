import { registerAuthMessages } from '#layers/auth/shared/constants/authMessages';
import {
  EMAIL_VERIFICATION_ERROR_MESSAGES,
  EMAIL_VERIFICATION_SUCCESS_MESSAGES,
} from '../../shared/constants/emailVerificationMessages';

export default defineNuxtPlugin(() => {
  registerAuthMessages({
    errors: EMAIL_VERIFICATION_ERROR_MESSAGES,
    success: EMAIL_VERIFICATION_SUCCESS_MESSAGES,
  });
});
