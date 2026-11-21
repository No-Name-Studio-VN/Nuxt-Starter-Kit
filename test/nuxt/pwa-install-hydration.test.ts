import { useNuxtApp } from '#imports';
import { SidebarProvider } from '@/components/ui/sidebar';
import InstallPrompter from '#layers/pwa/app/components/InstallPrompter.vue';
import { expect, it, vi } from 'vitest';
import { createSSRApp, h, nextTick } from 'vue';
import { renderToString } from 'vue/server-renderer';

it('hydrates the default install prompt before showing the browser-installed state', async () => {
  const nuxtApp = useNuxtApp();
  const makeApp = (installed: boolean) => {
    const app = createSSRApp({
      render: () => h(SidebarProvider, null, { default: () => h(InstallPrompter) }),
    });
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
  client.mount(container);
  try {
    await nextTick();
    expect(warnings.filter((warning) => warning.includes('Hydration'))).toEqual([]);
    expect(button()?.textContent).toContain('Installed');
    expect(button()?.querySelector('.lucide-check')).not.toBeNull();
  } finally {
    client.unmount();
    logError.mockRestore();
  }
});
