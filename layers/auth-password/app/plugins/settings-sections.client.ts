import '#layers/auth/types/extensions';
import { defineAsyncComponent } from 'vue';

export default defineNuxtPlugin(() => {
  registerExtension('settings:security:sections', {
    id: 'password',
    order: 0,
    component: defineAsyncComponent(() => import('../components/settings/PasswordCard.vue')),
  });
});
