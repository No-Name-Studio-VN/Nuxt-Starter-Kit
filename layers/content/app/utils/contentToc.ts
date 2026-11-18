import type { TocLink } from '@nuxt/content';
import type { AnimatedTocItem } from '@/components/ui/animated-toc';

/** Preserve document order, omit hidden subtrees, and normalize heading depths. */
export function flattenTocLinks(links: TocLink[]): AnimatedTocItem[] {
  const items: AnimatedTocItem[] = [];
  function visit(nodes: TocLink[]) {
    for (const link of nodes) {
      if (link.id === 'hide-toc') continue;
      items.push({ label: link.text, depth: link.depth, href: `#${link.id}` });
      if (link.children) visit(link.children);
    }
  }
  visit(links);
  // The shallowest heading, not an assumed h2, defines depth zero.
  const baseDepth = items.length ? Math.min(...items.map((item) => item.depth ?? 0)) : 0;
  return items.map((item) => ({ ...item, depth: (item.depth ?? 0) - baseDepth }));
}
