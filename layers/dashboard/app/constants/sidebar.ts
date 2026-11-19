import { getNavItems } from '@/utils/extensions';
import type { NavGuardContext } from '~~/types/extensions';
import type { SidebarContext, SidebarNavRecord } from '#layers/dashboard/types/sidebar';

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

/** Builds the same guarded navigation tree for the sidebar and quick search. */
export function getVisibleSidebarContexts(guardContext: NavGuardContext): SidebarContext[] {
  const records = getNavItems('sidebar');
  if (import.meta.dev) {
    warnOrphanRecords(records);
  }

  const items = records.filter((record) => record.kind === 'item');
  const sections = records.filter((record) => record.kind === 'section');

  return records.flatMap((record) => {
    if (record.kind !== 'context' || record.guard?.(guardContext) === false) {
      return [];
    }

    const visibleSections = sections.filter(
      (section) => section.context === record.id && section.guard?.(guardContext) !== false,
    );

    return [
      {
        ...record,
        sections: visibleSections.map((section) => ({
          ...section,
          items: items.filter((item) => item.section === section.id),
        })),
      },
    ];
  });
}
