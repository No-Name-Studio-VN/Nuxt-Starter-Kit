import type { Component } from 'vue';

export interface ExtensionSlots {
  'app:root': true;
  'home:hero': true;
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
}

export interface NavMenus {
  header: NavRecord;
}

export type NavMenu = keyof NavMenus;

export type NavRegistry = {
  [M in NavMenu]?: Map<string, NavMenus[M]>;
};
