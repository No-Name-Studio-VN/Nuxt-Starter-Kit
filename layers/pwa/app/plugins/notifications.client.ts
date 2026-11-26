import { toast } from 'vue-sonner';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const {
      $pwa,
      $i18n: { t },
    } = nuxtApp;
    if ($pwa?.offlineReady) {
      toast.success(t('pwa.offline_ready'));
    }

    if ($pwa?.needRefresh) {
      toast.warning(t('pwa.update_available'), {
        action: {
          label: t('pwa.update'),
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
