import { LandingHero, HeaderSearch } from '#components';

export default defineNuxtPlugin(() => {
  registerExtension('home:hero', { id: 'content-hero', order: 100, component: LandingHero });
  registerExtension('header:actions', { id: 'content-search', order: 100, component: HeaderSearch });
  registerNavItem('header', {
    id: 'content-docs', order: 100, labelKey: 'nav.docs', to: '/docs',
    target: '_self', showLinkIcon: false,
  });
  registerNavItem('header', {
    id: 'content-products', order: 200, labelKey: 'Products', to: '',
    links: [
      { labelKey: 'Bot No Name', to: '/botnoname',
        descriptionKey: 'A multifunctional, user-friendly, and intuitive Discord Bot. Ticket, Giveaway, Music, Moderation, Games and more.', icon: 'lucide:bot' },
      { labelKey: 'Nuxt Starter Kit', to: '/products/nuxt-starter-kit/getting-started/introduction',
        descriptionKey: 'Fully equipped Technical Starter Pack for busy Nuxters.', icon: 'lucide:rocket' },
    ],
  });
  registerNavItem('header', {
    id: 'content-blog', order: 300, labelKey: 'nav.blog', to: '/blogs',
    target: '_self', showLinkIcon: false,
  });
});
