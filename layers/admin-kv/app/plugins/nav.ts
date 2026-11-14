import '#layers/admin/types/extensions';
import { DatabaseIcon } from '@lucide/vue';
import type { AdminCardRecord } from '#layers/admin/types/adminCards';

const adminCardRecords: AdminCardRecord[] = [
  {
    id: 'kv',
    order: 300,
    title: 'KV Store',
    description: 'Browse and manage KV keys, values, and cache clearing controls',
    to: '/admin/kv',
    icon: DatabaseIcon,
    bgColor: 'bg-slate-500/10',
    textColor: 'text-slate-500',
  },
];

/** The KV browser's card on the admin landing page. */
export default defineNuxtPlugin(() => {
  for (const record of adminCardRecords) {
    registerNavItem('adminCards', record);
  }
});
