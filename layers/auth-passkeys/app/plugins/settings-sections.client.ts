import '#layers/auth/types/extensions';
import { defineAsyncComponent } from 'vue';

export default defineNuxtPlugin(() => {
  registerExtension('settings:security:sections', {
    id: 'passkeys',
    order: 10,
    component: defineAsyncComponent(() => import('../components/settings/PasskeysSection.vue')),
  });
});
