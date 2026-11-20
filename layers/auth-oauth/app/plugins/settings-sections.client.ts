import '#layers/auth/types/extensions';
import { defineAsyncComponent } from 'vue';

export default defineNuxtPlugin(() => {
  registerExtension('settings:security:sections', {
    id: 'connected-accounts',
    order: 5,
    component: defineAsyncComponent(() => import('../components/settings/ConnectedAccountsCard.vue')),
  });
});
