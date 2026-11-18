import type { TocLink } from '@nuxt/content';
import type { Ref } from 'vue';
import { computed, nextTick, onMounted, onScopeDispose, watch } from 'vue';
import type { UseContentTocOptions } from '#layers/content/types/content-toc';
import { useScrollspy } from '#layers/content/app/composables/useScrollspy';
import { flattenTocLinks } from '#layers/content/app/utils/contentToc';

/** Shared heading observation for content, including suspended renders. */
export function useContentToc(
  links: Readonly<Ref<TocLink[]>>,
  { scopeSelector = '.docs-content', headingLevels = [1, 2, 3, 4] }: UseContentTocOptions = {},
) {
  const items = computed(() => flattenTocLinks(links.value));
  const { activeHeadings, updateHeadings } = useScrollspy();
  const activeIndex = computed({
    // Document order gives a visible parent priority over its visible children.
    get: () =>
      Math.max(
        0,
        items.value.findIndex((item) => activeHeadings.value.includes(item.href?.slice(1) ?? '')),
      ),
    set: (index: number) => {
      const href = items.value[index]?.href;
      if (href) activeHeadings.value = [href.slice(1)];
    },
  });
  // Group selector lists so each heading remains scoped to a content container.
  const headingSelector = headingLevels
    .map((level) => `:is(${scopeSelector}) h${level}`)
    .join(', ');
  function observeHeadings() {
    updateHeadings(headingSelector ? [...document.querySelectorAll(headingSelector)] : []);
  }
  onMounted(() => void nextTick(observeHeadings));
  watch(items, () => void nextTick(observeHeadings), { flush: 'post' });
  const removeHook = useNuxtApp().hook('page:finish', observeHeadings);
  onScopeDispose(removeHook);
  return { items, activeIndex };
}
