import '#layers/auth/types/extensions';
import { defineAsyncComponent } from 'vue';

export default defineNuxtPlugin(() => {
  registerExtension('settings:security:sections', {
    id: 'two-factor',
    order: 20,
    component: defineAsyncComponent(() => import('../components/settings/TwoFactorSection.vue')),
  });
});
