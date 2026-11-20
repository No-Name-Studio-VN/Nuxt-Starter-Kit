import RememberedPasswordSignIn from '../components/auth/RememberedPasswordSignIn.vue';
import '#layers/auth/types/extensions';
import PasswordLoginForm from '#layers/auth-password/app/components/auth/PasswordLoginForm.vue';
import SignUpLink from '#layers/auth-password/app/components/auth/SignUpLink.vue';
import { registerAuthMessages } from '#layers/auth/shared/constants/authMessages';
import {
  PASSWORD_ERROR_MESSAGES,
  PASSWORD_SUCCESS_MESSAGES,
} from '#layers/auth-password/shared/constants/passwordMessages';

export default defineNuxtPlugin(() => {
  registerExtension('auth:login:remembered', { id: 'password', order: 100, component: RememberedPasswordSignIn });
  registerExtension('auth:login:methods', {
    id: 'password',
    order: 200,
    component: PasswordLoginForm,
  });
  registerExtension('auth:login:footer', {
    id: 'password-sign-up',
    order: 100,
    component: SignUpLink,
  });
  registerAuthMessages({ errors: PASSWORD_ERROR_MESSAGES, success: PASSWORD_SUCCESS_MESSAGES });
});
