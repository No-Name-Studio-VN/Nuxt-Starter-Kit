import type { Component, Ref } from 'vue';
import type { SidebarNavRecord } from '~~/types/sidebar';

export interface ExtensionSlots {
  'app:root': true;
  'home:hero': true;
  'header:actions': true;
}

export type ExtensionSlotName = keyof ExtensionSlots;

export interface ExtensionEntry {
  id: string;
  order: number;
  component: Component;
  /** Runs in the slot setup, so availability may depend on request data. */
  useAvailable?: () => Readonly<Ref<boolean>>;
}

export interface NavRecord {
  id: string;
  order: number;
  labelKey: string;
  to: string;
  icon?: Component;
  descriptionKey?: string;
  target?: string;
  showLinkIcon?: boolean;
  links?: {
    labelKey: string;
    to: string;
    target?: string;
    descriptionKey?: string;
    icon?: string;
  }[];
}

/** Contributions are optional because not every app installs their provider. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- layers add keys by declaration merging
export interface NavGuardContext {}

export type NavGuard = (context: NavGuardContext) => boolean;
export type NavGuardContextProvider<K extends keyof NavGuardContext> = () => Readonly<
  Ref<NavGuardContext[K]>
>;

export type NavGuardContextProviders = Map<
  keyof NavGuardContext,
  () => (context: NavGuardContext) => void
>;

export interface NavMenus {
  header: NavRecord;
  sidebar: SidebarNavRecord;
}

export type NavMenu = keyof NavMenus;

export type NavRegistry = {
  [M in NavMenu]?: Map<string, NavMenus[M]>;
};
