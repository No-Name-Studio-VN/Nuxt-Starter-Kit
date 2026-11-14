import '#layers/pwa/types/extensions';
import { NuxtPwaAssets } from '#components';
import { defineAsyncComponent } from 'vue';

export default defineNuxtPlugin(() => {
  registerExtension('app:root', {
    id: 'pwa-assets',
    order: 100,
    component: NuxtPwaAssets,
  });
  registerExtension('sidebar:footer', {
    id: 'pwa-install',
    order: 100,
    component: defineAsyncComponent(() => import('../components/InstallPrompter.vue')),
  });
});
