import '#layers/auth/types/extensions';
import PasswordLoginForm from '#layers/auth/app/components/auth/PasswordLoginForm.vue';

export default defineNuxtPlugin(() => {
  registerExtension('auth:login:methods', {
    id: 'password',
    order: 200,
    component: PasswordLoginForm,
  });
});
