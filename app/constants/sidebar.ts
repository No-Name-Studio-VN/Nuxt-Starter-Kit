import type {
  SidebarContext,
  SidebarGuardContext,
  SidebarGuardUser,
  SidebarItem,
  SidebarNavRecord,
} from '#layers/auth/types/sidebar';
// <nsk:feature-flags>
import { FlagIcon } from '@lucide/vue';
// </nsk:feature-flags>

/**
 * Admin pages whose modules have not registered them yet, in the same records the
 * nav registry holds. Each lands in the admin section it names, as if registered.
 */
const INLINE_SIDEBAR_RECORDS: SidebarNavRecord[] = [
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
];

/** In development, names every record whose parent section or context is not registered. */
function warnOrphanRecords(records: readonly SidebarNavRecord[]): void {
  const idsOf = (kind: SidebarNavRecord['kind']) =>
    new Set(records.flatMap((record) => (record.kind === kind ? [record.id] : [])));
  const sectionIds = idsOf('section');
  const contextIds = idsOf('context');

  for (const record of records) {
    const parent =
      record.kind === 'item'
        ? { id: record.section, known: sectionIds.has(record.section) }
        : record.kind === 'section'
          ? { id: record.context, known: contextIds.has(record.context) }
          : null;
    if (parent && !parent.known) {
      console.warn(`[sidebar] "${record.id}" is not shown: its parent "${parent.id}" is missing.`);
    }
  }
}

/** Nests sidebar records into contexts, sections and items, each level sorted by `order`. */
function buildSidebarContexts(records: readonly SidebarNavRecord[]): SidebarContext[] {
  if (import.meta.dev) {
    warnOrphanRecords(records);
  }

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
  const registered = getNavItems('sidebar');
  const registeredIds = new Set(registered.map((record) => record.id));
  // A registered record wins over an inline record with the same id.
  const inline = INLINE_SIDEBAR_RECORDS.filter((record) => {
    if (!registeredIds.has(record.id)) {
      return true;
    }
    if (import.meta.dev) {
      console.warn(`[sidebar] "${record.id}" is registered; its inline record is skipped.`);
    }
    return false;
  });

  return buildSidebarContexts([...registered, ...inline]);
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
