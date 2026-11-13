import { HeaderSearch } from '#components';
import { defineAsyncComponent } from 'vue';
import { DOCS_CONFIG } from '../../docs.config';

export default defineNuxtPlugin(() => {
  registerExtension('home:hero', {
    id: 'content-hero',
    order: 100,
    component: defineAsyncComponent(() => import('../components/LandingHero.vue')),
  });
  registerExtension('header:actions', {
    id: 'content-search',
    order: 100,
    component: HeaderSearch,
  });

  DOCS_CONFIG.headerNav.forEach((item, index) => {
    registerNavItem('header', {
      id: `content-header-${index}`,
      order: index,
      labelKey: item.title,
      to: item.to ?? '',
      target: item.target,
      showLinkIcon: item.showLinkIcon,
      links: item.links?.map((link) => ({
        labelKey: link.title,
        to: link.to,
        descriptionKey: link.description,
        icon: link.icon,
      })),
    });
  });
});
