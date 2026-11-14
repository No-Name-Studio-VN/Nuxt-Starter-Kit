/**
 * A navigation tree node, declared structurally rather than imported from
 * `@nuxt/content`.
 *
 * Helpers that only walk the tree need its shape, not the content module — so
 * declaring it here is what lets them stay in place when the module is not
 * installed. `ContentNavigationItem` is assignable to this.
 */
export interface NavigationItem {
  title: string;
  path: string;
  stem?: string;
  children?: NavigationItem[];
  page?: false;
  [key: string]: unknown;
}

export interface SiteConfig {
  site: {
    name: string;
    description: string;
    ogImage: string;
    umami: {
      enable: boolean;
      src: string;
      dataWebsiteId: string;
    };
  };
  theme: {
    customizable: boolean;
    color: Color;
    radius: number;
  };
  header: {
    showLoadingIndicator: boolean;
    title: string;
    showTitle: boolean;
    border: boolean;
    logo: {
      light: string;
      dark: string;
    };
    showTitleInMobile: boolean;
    darkModeToggle: boolean;
    languageSwitcher: {
      enable: boolean;
      triggerType: 'icon' | 'text';
      dropdownType: 'select' | 'popover';
    };
    nav: {
      title: string;
      to: string;
      target?: string;
      showLinkIcon?: boolean;
      links?: {
        title?: string;
        to?: string;
        target?: string;
        description?: string;
        icon?: string;
      }[];
    }[];
    links: {
      icon: string;
      to: string;
      target?: string;
    }[];
  };
}

export type Color =
  | 'zinc'
  | 'slate'
  | 'stone'
  | 'gray'
  | 'neutral'
  | 'red'
  | 'rose'
  | 'orange'
  | 'green'
  | 'blue'
  | 'yellow'
  | 'violet';

export type Target = '_blank' | '_parent' | '_self' | '_top' | (string & object) | null | undefined;

export interface PageBreadcrumbItem {
  title: string;
  path: string;
}
