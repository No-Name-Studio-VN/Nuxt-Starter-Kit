import type { NuxtPage } from 'nuxt/schema';

export type Locale = 'en' | 'vi';
export type UnprefixedPageRule = (page: NuxtPage) => boolean;
