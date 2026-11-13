import type { Component } from 'vue';
import type { Color, Target, SiteConfig } from '~~/types';
export type { NavigationItem, Target } from '~~/types';

export interface DocsConfig {
  site: {
    name: string;
    description: string;
    ogImage: string;
    ogImageComponent: string;
    ogImageColor: 'dark' | 'light';
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
  banner: {
    enable: boolean;
    showClose: boolean;
    content: string;
    to: string;
    target: Target;
    border: boolean;
  };
  header: SiteConfig['header'];
  aside: {
    useLevel: boolean;
    levelStyle: 'aside' | 'header';
    headerLevelNavAlign: 'start' | 'center' | 'end';
    collapse: boolean;
    collapseLevel: number;
    folderStyle: 'default' | 'tree' | 'group';
  };
  main: {
    breadCrumb: boolean;
    showTitle: boolean;
    codeCopyToast: boolean;
    codeCopyToastText: string;
    fieldRequiredText: string;
    padded: boolean;
    editLink: {
      enable: boolean;
      pattern: string;
      text: string;
      icon: string;
      placement: ('docsFooter' | 'toc')[];
    };
    issueLink: {
      enable: boolean;
      pattern: string;
      text: string;
      icon: string;
      placement: ('docsFooter' | 'toc')[];
    };
    backToTop: boolean;
    pm: ('npm' | 'pnpm' | 'bun' | 'yarn')[];
    imageZoom: boolean;
  };
  footer: {
    credits: string;
    border: boolean;
    links: {
      icon: string;
      title: string;
      to: string;
      target: string;
    }[];
  };
  toc: {
    enable: boolean;
    enableInMobile: boolean;
    enableInHomepage: boolean;
    progressBar: boolean;
    title: string;
    links: {
      title: string;
      icon: string;
      to: string;
      target: string;
      showLinkIcon: boolean;
    }[];
    iconLinks: {
      icon: string;
      to: string;
      target: string;
    }[];
    carbonAds: {
      enable: boolean;
      disableInDev: boolean;
      disableInMobile: boolean;
      fallback: boolean;
      fallbackMessage: string;
      code: string;
      placement: string;
      format: 'cover' | 'responsive';
    };
  };
  search: {
    enable: boolean;
    inAside: boolean;
    style: 'input' | 'button';
    placeholder: string;
    placeholderDetailed: string;
  };
  data?: {
    [key: string]: unknown;
  };
}

export type FileTreeItemDiff = 'addition' | 'deletion' | 'none';
export interface FileTreeItem {
  title: string;
  icon?: Component | string;
  children?: FileTreeItem[];
  highlighted: boolean;
  diff: FileTreeItemDiff;
  path?: string;
}

export type InputTreeItem =
  | string
  | {
      [key: string]: InputTreeItem[] | null;
    };

/**
 * A badge declared on a navigation entry's frontmatter. `variant` is narrowed to
 * what the Badge component accepts; anything else is dropped when read.
 */
export interface NavigationBadge {
  value: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline';
  type?: string;
  size?: string;
}

