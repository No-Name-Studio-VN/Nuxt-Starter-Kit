import '#layers/dashboard/types/extensions';
import { Home, Search, UserCog2Icon } from '@lucide/vue';
import type { SidebarNavRecord } from '#layers/dashboard/types/sidebar';

const sidebarRecords: SidebarNavRecord[] = [
  { kind: 'context', id: 'main', order: 300, match: '/' },
  { kind: 'section', id: 'main.discover', order: 100, context: 'main', title: 'nav.discover' },
  {
    kind: 'item',
    id: 'main.discover.home',
    order: 100,
    section: 'main.discover',
    title: 'common.home',
    url: '/',
    icon: Home,
  },
  {
    kind: 'item',
    id: 'main.discover.search',
    order: 200,
    section: 'main.discover',
    title: 'nav.search',
    url: '/search',
    icon: Search,
  },
  {
    kind: 'section',
    id: 'main.support',
    order: 400,
    context: 'main',
    title: 'nav.support',
    secondary: true,
  },
  {
    kind: 'item',
    id: 'main.support.help',
    order: 100,
    section: 'main.support',
    title: 'nav.help_support',
    url: '/support',
    icon: UserCog2Icon,
  },
];

export default defineNuxtPlugin(() => {
  for (const record of sidebarRecords) {
    registerNavItem('sidebar', record);
  }
});
