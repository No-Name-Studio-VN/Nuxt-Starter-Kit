// <nsk:auth>
import type { Component } from 'vue';
// The session user, not the database row: sidebar guards run in the browser
// against whatever `useUserSession()` exposes.
import type { User } from '#auth-utils';
// </nsk:auth>

// <nsk:auth>
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

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
  /** Push to bottom of sidebar (e.g. "Support") */
  secondary?: boolean;
  /** Per-section access guard */
  guard?: (user: SidebarGuardUser, context: SidebarGuardContext) => boolean;
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
  guard?: (user: SidebarGuardUser, context: SidebarGuardContext) => boolean;
}
// </nsk:auth>

export interface BreadcrumbItemType {
  title: string;
  href: string;
}

export interface MessagePayload {
  message: string;
}

export interface StatusPayload {
  status: string;
  timestamp: number;
}

export interface DeletedPayload {
  deleted: true;
}

export type FormatDateInput = Date | number | string;

export interface FormatDateOptions extends Intl.DateTimeFormatOptions {
  fallback?: string;
}
