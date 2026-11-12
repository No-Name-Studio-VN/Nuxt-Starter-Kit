import type { Component } from 'vue';
// The session user, not the database row: sidebar guards run in the browser
// against whatever `useUserSession()` exposes.
import type { User } from '#auth-utils';

export type SidebarItem = {
  title: string;
  url?: string;
  icon?: Component;
  items?: SidebarItem[];
};

export type SidebarGuardUser = User | null | undefined;

export type SidebarGuardContext = {
  flags: Record<string, boolean>;
};

/** Access guard — return false to hide the entry */
export type SidebarGuard = (user: SidebarGuardUser, context: SidebarGuardContext) => boolean;

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
  /** Push to bottom of sidebar (e.g. "Support") */
  secondary?: boolean;
  /** Per-section access guard */
  guard?: SidebarGuard;
}

export interface SidebarContext {
  /** Unique key used as transition key */
  id: string;
  /** Route prefix that activates this context (e.g. '/settings') */
  match: string;
  /** Grouped nav sections to render */
  sections: SidebarSection[];
  /** Sidebar variant override (defaults to 'inset') */
  variant?: 'sidebar' | 'inset' | 'floating';
  /** Show "Back" button in header */
  showBack?: boolean;
  /** Access guard — return false to skip this context */
  guard?: SidebarGuard;
}

export interface SidebarContextRecord extends Omit<SidebarContext, 'sections'> {
  kind: 'context';
  order: number;
}

export interface SidebarSectionRecord extends Omit<SidebarSection, 'items'> {
  kind: 'section';
  /** Unique across the whole `sidebar` menu, e.g. 'main.discover' */
  id: string;
  order: number;
  /** Id of the context the section renders in */
  context: string;
}

export interface SidebarItemRecord extends SidebarItem {
  kind: 'item';
  /** Unique across the whole `sidebar` menu, e.g. 'main.discover.home' */
  id: string;
  order: number;
  /** Id of the section the item renders in */
  section: string;
}

/**
 * One entry of the `sidebar` nav menu. Any module can add a context, a section
 * to any context, or an item to any section; the sidebar nests them by id and
 * sorts each level by `order`.
 */
export type SidebarNavRecord = SidebarContextRecord | SidebarSectionRecord | SidebarItemRecord;

/** One entry of the `userMenu` nav menu, the account dropdown in the sidebar header. */
export interface UserMenuRecord {
  id: string;
  order: number;
  title: string;
  to: string;
  icon: Component;
  guard?: SidebarGuard;
}
