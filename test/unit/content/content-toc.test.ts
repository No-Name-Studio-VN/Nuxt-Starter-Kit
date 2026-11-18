import type { TocLink } from '@nuxt/content';
import { describe, expect, it } from 'vitest';
import { flattenTocLinks } from '#layers/content/app/utils/contentToc';

const heading = (id: string, depth: number, children: TocLink[] = [], text = id): TocLink => ({
  id,
  text,
  depth,
  children,
});

describe('content TOC links', () => {
  it('flattens nested content headings in document order with relative depths', () => {
    expect(
      flattenTocLinks([
        heading('intro', 2, [heading('details', 3, [heading('example', 4)])]),
        heading('next', 2),
      ]),
    ).toEqual([
      { label: 'intro', depth: 0, href: '#intro' },
      { label: 'details', depth: 1, href: '#details' },
      { label: 'example', depth: 2, href: '#example' },
      { label: 'next', depth: 0, href: '#next' },
    ]);
  });

  it('ignores hide-toc subtrees at any depth without mutating the source', () => {
    const links = [
      heading('hide-toc', 1, [heading('hidden-child', 2)]),
      heading('visible', 3, [heading('hide-toc', 4), heading('child', 4)]),
    ];
    const original = structuredClone(links);
    expect(flattenTocLinks(links)).toEqual([
      { label: 'visible', depth: 0, href: '#visible' },
      { label: 'child', depth: 1, href: '#child' },
    ]);
    expect(links).toEqual(original);
  });

  it('normalizes against the actual shallowest heading and preserves skipped levels', () => {
    expect(flattenTocLinks([heading('deeper', 4), heading('shallower', 1)])).toEqual([
      { label: 'deeper', depth: 3, href: '#deeper' },
      { label: 'shallower', depth: 0, href: '#shallower' },
    ]);
  });

  it('handles empty trees and keeps duplicate labels with their distinct anchors', () => {
    expect(flattenTocLinks([])).toEqual([]);
    expect(flattenTocLinks([heading('hide-toc', 2)])).toEqual([]);
    const items = flattenTocLinks([
      heading('example', 2, [], 'Example'),
      heading('example-1', 2, [], 'Example'),
    ]);
    expect(items.map((item) => item.href)).toEqual(['#example', '#example-1']);
    expect(items.map((item) => item.label)).toEqual(['Example', 'Example']);
  });
});
