import { toast } from 'vue-sonner';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const { $pwa } = nuxtApp;
    if ($pwa?.offlineReady) {
      toast.success('App is ready to work offline.');
    }

    if ($pwa?.needRefresh) {
      toast.warning('A new version is available.', {
        action: {
          label: 'Update',
          onClick: () => {
            $pwa.updateServiceWorker();
            window.location.reload();
          },
        },
        duration: Infinity,
      });
    }
  });
});
