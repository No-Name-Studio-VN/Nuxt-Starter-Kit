// @vitest-environment happy-dom
import type { TocLink } from '@nuxt/content';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, shallowRef } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseContentTocOptions } from '#layers/content/types/content-toc';
import { useContentToc } from '#layers/content/app/composables/useContentToc';

const { updateHeadings, removeHook } = vi.hoisted(() => ({
  updateHeadings: vi.fn<(headings: Element[]) => void>(),
  removeHook: vi.fn(),
}));
const activeHeadings = shallowRef<string[]>([]);
vi.mock('#layers/content/app/composables/useScrollspy', () => ({
  useScrollspy: () => ({ activeHeadings, updateHeadings }),
}));

const pageFinishCallbacks: (() => void)[] = [];
const unmountCallbacks: (() => void)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  activeHeadings.value = [];
  pageFinishCallbacks.length = 0;
  document.body.innerHTML = `
    <h2 id="outside">Outside</h2>
    <article class="docs-content">
      <h1 id="title">Title</h1><h2 id="intro">Intro</h2>
      <h3 id="details">Details</h3><h4 id="example">Example</h4><h5 id="extra">Extra</h5>
    </article>
    <article class="article-content"><h2 id="article">Article</h2><h5 id="deep">Deep</h5></article>
  `;
  vi.stubGlobal('useNuxtApp', () => ({
    hook: (_name: string, callback: () => void) => {
      pageFinishCallbacks.push(callback);
      return removeHook;
    },
  }));
});

afterEach(() => {
  for (const unmount of unmountCallbacks.splice(0)) unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function mountToc(options?: UseContentTocOptions) {
  const links = shallowRef<TocLink[]>([
    {
      id: 'intro',
      text: 'Intro',
      depth: 2,
      children: [{ id: 'details', text: 'Details', depth: 3 }],
    },
  ]);
  let toc: ReturnType<typeof useContentToc> | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        toc = useContentToc(links, options);
        return () => null;
      },
    }),
  );
  unmountCallbacks.push(() => wrapper.unmount());
  if (!toc) throw new Error('The content TOC composable did not mount');
  return { toc, links };
}

function observedIds() {
  return updateHeadings.mock.lastCall?.[0].map((element) => element.id);
}

describe('content TOC observation', () => {
  it('observes only h1 through h4 inside docs content by default, in document order', async () => {
    mountToc();
    await nextTick();
    expect(observedIds()).toEqual(['title', 'intro', 'details', 'example']);
  });

  it('supports a custom scope and heading levels', async () => {
    mountToc({ scopeSelector: '.article-content', headingLevels: [2, 5] });
    await nextTick();
    expect(observedIds()).toEqual(['article', 'deep']);
  });

  it('keeps every heading scoped when the scope selector contains a list', async () => {
    mountToc({ scopeSelector: '.docs-content, .article-content', headingLevels: [5] });
    await nextTick();
    expect(observedIds()).toEqual(['extra', 'deep']);
  });

  it('allows observation to be disabled with an empty heading list', async () => {
    mountToc({ headingLevels: [] });
    await nextTick();
    expect(observedIds()).toEqual([]);
  });

  it('refreshes after link changes and page completion, and removes its hook on disposal', async () => {
    const { links } = mountToc();
    await nextTick();
    updateHeadings.mockClear();
    links.value = [{ id: 'extra', text: 'Extra', depth: 5 }];
    await nextTick();
    await nextTick();
    expect(updateHeadings).toHaveBeenCalledTimes(1);
    for (const callback of pageFinishCallbacks) callback();
    expect(updateHeadings).toHaveBeenCalledTimes(2);
    for (const unmount of unmountCallbacks.splice(0)) unmount();
    expect(removeHook).toHaveBeenCalledOnce();
  });

  it('prefers visible parents in document order and updates the active heading on selection', () => {
    const { toc } = mountToc();
    activeHeadings.value = ['details', 'intro'];
    expect(toc.activeIndex.value).toBe(0);
    activeHeadings.value = ['details'];
    expect(toc.activeIndex.value).toBe(1);
    toc.activeIndex.value = 0;
    expect(activeHeadings.value).toEqual(['intro']);
  });
});
