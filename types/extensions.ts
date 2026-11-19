import type { Component, Ref } from 'vue';

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
}

export type NavMenu = keyof NavMenus;

export type NavRegistry = {
  [M in NavMenu]?: Map<string, NavMenus[M]>;
};
