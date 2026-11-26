import { useNuxtApp } from '#imports';
import { SidebarProvider } from '@/components/ui/sidebar';
import InstallPrompter from '#layers/pwa/app/components/InstallPrompter.vue';
import { expect, it, vi } from 'vitest';
import { createSSRApp, h, nextTick } from 'vue';
import { renderToString } from 'vue/server-renderer';

it('hydrates the default install prompt before showing the browser-installed state', async () => {
  const nuxtApp = useNuxtApp();
  const i18n = nuxtApp.$i18n;
  const initialLocale = i18n.locale.value;
  const makeApp = (installed: boolean) => {
    const app = createSSRApp({
      render: () => h(SidebarProvider, null, { default: () => h(InstallPrompter) }),
    });
    app.config.globalProperties.$t = nuxtApp.$i18n.t;
    Object.defineProperty(app, '$nuxt', {
      value: {
        ...nuxtApp,
        $config: nuxtApp.$config,
        $pwa: installed ? { ...nuxtApp.$pwa, isPWAInstalled: true } : undefined,
      },
    });
    return app;
  };

  const container = document.createElement('div');
  container.innerHTML = await renderToString(makeApp(false));
  const button = () => container.querySelector('[data-sidebar="menu-button"]');
  expect(button()?.textContent).toContain('Install App');
  expect(button()?.querySelector('.lucide-download')).not.toBeNull();

  const warnings: string[] = [];
  const client = makeApp(true);
  client.config.warnHandler = (message) => warnings.push(message);
  const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
  let mounted = false;
  try {
    client.mount(container);
    mounted = true;
    await nextTick();
    expect(warnings.filter((warning) => warning.includes('Hydration'))).toEqual([]);
    expect(logError.mock.calls.flat()).not.toContainEqual(
      expect.stringMatching(/hydration.*mismatch/i),
    );
    expect(button()?.textContent).toContain('Installed');
    expect(button()?.querySelector('.lucide-check')).not.toBeNull();

    await i18n.loadLocaleMessages('vi');
    i18n.locale.value = 'vi';
    await nextTick();
    expect(button()?.textContent).toContain('Đã cài đặt');
  } finally {
    logError.mockRestore();
    try {
      if (mounted) client.unmount();
    } finally {
      i18n.locale.value = initialLocale;
    }
  }
});
