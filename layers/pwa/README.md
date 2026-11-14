# Progressive web app

Adds installable PWA assets, a production service worker and the `/~offline` fallback.
The manifest starts at `/pwa` and includes a Home shortcut; the optional dashboard shortcut is omitted.
Page tracking remembers the last non-system page in a cookie and browser storage.
The `app:root` extension renders `NuxtPwaAssets`; `sidebar:footer` adds the install prompt when a sidebar host exists.
No other layer is required and no environment keys need filling.
`pwa.pwaAssets` loads this layer's `pwa-assets.config.ts`, using the base `public/favicon.svg` as its source.
Run `pnpm dev` to preview the generated assets, or `pnpm build` to emit them with the manifest and service worker.
PWA mobile metadata and Apple icons are included only while this layer is installed.
