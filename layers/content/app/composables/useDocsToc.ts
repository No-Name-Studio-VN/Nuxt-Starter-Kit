import type { TocLink } from '@nuxt/content';
import { usePageData } from './usePageData';

function readToc(value: unknown): TocLink[] | null {
  if (typeof value !== 'object' || value === null || !('links' in value)) return null;
  if (!Array.isArray(value.links)) return null;
  return value.links.filter(
    (link): link is TocLink =>
      typeof link === 'object' &&
      link !== null &&
      typeof link.id === 'string' &&
      typeof link.text === 'string' &&
      typeof link.depth === 'number',
  );
}

/** Prefer parsed headings for SSR; scan rendered component headings only as a fallback. */
export function useDocsToc() {
  const { page } = usePageData();
  const route = useRoute();
  const nuxtApp = useNuxtApp();
  const domLinks = shallowRef<TocLink[] | null>(null);
  const mounted = shallowRef(false);

  const parsedLinks = computed(() => {
    const frontmatterLinks = readToc(page.value?.toc);
    return frontmatterLinks?.length ? frontmatterLinks : readToc(page.value?.body?.toc);
  });
  const tocLinks = computed(() => {
    const links = parsedLinks.value;
    return (links?.length ? links : (domLinks.value ?? links ?? [])).filter(
      (link) => link.id !== 'hide-toc',
    );
  });
  const pending = computed(() => parsedLinks.value === null && domLinks.value === null);

  function updateFromDom() {
    if (!mounted.value || parsedLinks.value?.length) return;
    const content = document.querySelector('.docs-content');
    // The content renderer may still be suspended. page:finish will retry once ready.
    if (!content) return;

    const result: TocLink[] = [];
    const stack: TocLink[] = [];
    let headingIndex = 0;
    for (const element of content.querySelectorAll('h2, h3, h4')) {
      const text = element.textContent?.trim() ?? '';
      if (!text) continue;
      if (!element.id) {
        element.id =
          text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || `heading-${headingIndex}`;
      }
      const heading: TocLink = {
        id: element.id,
        text,
        depth: Number(element.tagName.charAt(1)),
        children: [],
      };
      while (stack.length && (stack[stack.length - 1]?.depth ?? 0) >= heading.depth) stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children ??= [];
        parent.children.push(heading);
      } else {
        result.push(heading);
      }
      stack.push(heading);
      headingIndex++;
    }
    domLinks.value = result;
  }

  watch(
    [page, () => route.path],
    () => {
      domLinks.value = null;
      if (mounted.value) void nextTick(updateFromDom);
    },
    { flush: 'post' },
  );

  onMounted(() => {
    mounted.value = true;
    void nextTick(updateFromDom);
  });
  const removeHook = nuxtApp.hook('page:finish', updateFromDom);
  onScopeDispose(removeHook);

  return { tocLinks, pending };
}
