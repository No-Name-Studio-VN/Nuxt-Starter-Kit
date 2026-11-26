import { Bell, Shield, Wifi, Zap } from '@lucide/vue';

export const INSTALL_PROMPTER_FEATURES = [
  {
    icon: Zap,
    title: 'pwa.features.instant_access.title',
    description: 'pwa.features.instant_access.description',
    colorClass: 'blue',
  },
  {
    icon: Wifi,
    title: 'pwa.features.offline.title',
    description: 'pwa.features.offline.description',
    colorClass: 'green',
  },
  {
    icon: Bell,
    title: 'pwa.features.notifications.title',
    description: 'pwa.features.notifications.description',
    colorClass: 'purple',
  },
  {
    icon: Shield,
    title: 'pwa.features.privacy.title',
    description: 'pwa.features.privacy.description',
    colorClass: 'orange',
  },
];
