import type { ModuleOptions } from '@vite-pwa/nuxt';

export type PwaManifest = Exclude<ModuleOptions['manifest'], boolean | undefined>;
