import { APP_MANIFEST } from '../../shared/constants/manifest';

export const DOCS_CONFIG = {
  headerNav: [
    {
      title: 'nav.docs',
      to: '/docs',
      target: '_self',
      showLinkIcon: false,
    },
    {
      title: 'Products',
      links: [
        {
          title: 'Bot No Name',
          to: '/botnoname',
          description:
            'A multifunctional, user-friendly, and intuitive Discord Bot. Ticket, Giveaway, Music, Moderation, Games and more.',
          icon: 'lucide:bot',
        },
        {
          title: 'Nuxt Starter Kit',
          to: '/products/nuxt-starter-kit/getting-started/introduction',
          description: 'Fully equipped Technical Starter Pack for busy Nuxters.',
          icon: 'lucide:rocket',
        },
      ],
    },
    {
      title: 'nav.blog',
      to: '/blogs',
      target: '_self',
      showLinkIcon: false,
    },
  ],
  banner: {
    enable: false,
    showClose: true,
    content: `Welcome to **${APP_MANIFEST.name}**`,
    to: 'https://github.com/No-Name-Studio-VN/Homepage',
    target: '_blank',
    border: true,
  },
  aside: {
    useLevel: true,
    levelStyle: 'aside',
    collapse: false,
    collapseLevel: 1,
    folderStyle: 'default',
  },
  main: {
    padded: true,
    breadCrumb: true,
    showTitle: true,
    codeCopyToast: false,
    editLink: {
      enable: true,
      pattern: 'https://github.com/No-Name-Studio-VN/Homepage/edit/main/www/content/:path',
      text: 'docs.editlink.title',
      icon: 'lucide:square-pen',
      placement: ['docsFooter'],
    },
    issueLink: {
      enable: true,
      pattern: 'https://github.com/No-Name-Studio-VN/Homepage/issues/new/choose',
      text: 'docs.issuelink.title',
      icon: 'lucide:circle-dot',
      placement: ['docsFooter'],
    },
    backToTop: true,
  },
  footer: {
    border: true,
    credits: 'FOOTER_CREDIT',
    links: [
      {
        icon: 'lucide:twitter',
        to: 'https://x.com/nn_myt',
        target: '_blank',
      },
      {
        icon: 'lucide:github',
        to: 'https://github.com/No-Name-Studio-VN/Homepage',
        target: '_blank',
      },
      {
        icon: 'lucide:mail',
        to: 'mailto:contact@nnsvn.me',
        target: '_blank',
      },
    ],
  },
  toc: {
    enable: true,
    enableInMobile: true,
    enableInHomepage: false,
    progressBar: true,
    title: 'docs.toc.title',
    links: [
      {
        title: 'cta.star_on_github',
        icon: 'lucide:star',
        to: 'https://github.com/No-Name-Studio-VN/Homepage',
        target: '_blank',
        showLinkIcon: true,
      },
      {
        title: 'docs.issuelink.title',
        icon: 'lucide:circle-dot',
        to: 'https://github.com/No-Name-Studio-VN/Homepage/issues/new/choose',
        target: '_blank',
        showLinkIcon: true,
      },
    ],
    iconLinks: [
      {
        icon: 'lucide:twitter',
        to: 'https://x.com/nn_myt',
        target: '_blank',
      },
      {
        icon: 'lucide:mail',
        to: 'mailto:contact@nnsvn.me',
        target: '_blank',
      },
    ],
    carbonAds: {
      enable: false,
      disableInDev: true,
      disableInMobile: false,
      fallback: false,
      fallbackMessage: 'errors.adblock',
      code: '',
      placement: 'nonamestudio-homepage',
      format: 'cover',
    },
  },
  search: {
    enable: true,
    inAside: false,
    style: 'input',
  },
  data: {},
};
