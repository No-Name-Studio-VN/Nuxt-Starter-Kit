import type {
  SidebarContext,
  SidebarGuardContext,
  SidebarGuardUser,
  SidebarItem,
  SidebarNavRecord,
} from '#layers/auth/types/sidebar';
import {
  // <nsk:feature-flags>
  FlagIcon,
  // </nsk:feature-flags>
  LayoutDashboardIcon,
  // <nsk:admin-users>
  UsersIcon,
  // </nsk:admin-users>
} from '@lucide/vue';

/**
 * Admin's entries, in the same records the nav registry holds. They stay here
 * until the admin module registers them itself; auth's own entries come from its
 * nav plugin.
 */
const ADMIN_SIDEBAR_RECORDS: SidebarNavRecord[] = [
  {
    kind: 'context',
    id: 'admin',
    order: 200,
    match: '/admin',
    variant: 'inset',
    showBack: true,
    guard: (user) => user?.isAdmin === true,
  },
  { kind: 'section', id: 'admin.overview', order: 100, context: 'admin', title: 'Overview' },
  {
    kind: 'item',
    id: 'admin.overview.dashboard',
    order: 100,
    section: 'admin.overview',
    title: 'Dashboard',
    url: '/admin',
    icon: LayoutDashboardIcon,
  },
  {
    kind: 'section',
    id: 'admin.users-sales',
    order: 200,
    context: 'admin',
    title: 'Users & Sales',
  },
  // <nsk:admin-users>
  {
    kind: 'item',
    id: 'admin.users-sales.users',
    order: 100,
    section: 'admin.users-sales',
    title: 'Users',
    url: '/admin/users',
    icon: UsersIcon,
  },
  // </nsk:admin-users>
  { kind: 'section', id: 'admin.system', order: 300, context: 'admin', title: 'System' },
  // <nsk:feature-flags>
  {
    kind: 'item',
    id: 'admin.system.feature-flags',
    order: 100,
    section: 'admin.system',
    title: 'Feature Flags',
    url: '/admin/feature-flags',
    icon: FlagIcon,
  },
  // </nsk:feature-flags>
  {
    kind: 'section',
    id: 'main.admin',
    order: 300,
    context: 'main',
    title: 'Admin',
    guard: (user) => user?.isAdmin === true,
  },
  {
    kind: 'item',
    id: 'main.admin.dashboard',
    order: 100,
    section: 'main.admin',
    title: 'Admin Dashboard',
    url: '/admin',
    icon: LayoutDashboardIcon,
  },
];

/** Nests sidebar records into contexts, sections and items, each level sorted by `order`. */
function buildSidebarContexts(records: readonly SidebarNavRecord[]): SidebarContext[] {
  const sorted = [...records].sort((a, b) => a.order - b.order);
  const items = sorted.flatMap((record) => (record.kind === 'item' ? [record] : []));
  const sections = sorted.flatMap((record) =>
    record.kind === 'section'
      ? [{ ...record, items: items.filter((item) => item.section === record.id) }]
      : [],
  );

  return sorted.flatMap((record) =>
    record.kind === 'context'
      ? [{ ...record, sections: sections.filter((section) => section.context === record.id) }]
      : [],
  );
}

/** Every sidebar context, read from the nav registry on each call. */
export function getSidebarContexts(): SidebarContext[] {
  return buildSidebarContexts([...getNavItems('sidebar'), ...ADMIN_SIDEBAR_RECORDS]);
}

export function getAllSidebarItems(
  user?: SidebarGuardUser,
  context?: SidebarGuardContext,
): SidebarItem[] {
  return getSidebarContexts().flatMap((ctx) => {
    if (context && ctx.guard && !ctx.guard(user, context)) {
      return [];
    }

    return ctx.sections.flatMap((section) => {
      if (context && section.guard && !section.guard(user, context)) {
        return [];
      }

      return section.items;
    });
  });
}
