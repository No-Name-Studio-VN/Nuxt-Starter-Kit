import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { expect, it, vi } from 'vitest';
import SearchDialog from '#layers/content/app/components/layout/SearchDialog.vue';

mockNuxtImport('queryCollectionSearchSections', () => async () => [
  {
    id: '/docs/search',
    title: 'Guide & reference',
    titles: ['Guide <example>'],
    content: 'Read the <em>GUIDE</em> & learn.',
    level: 2,
  },
]);

it('highlights matching search text without interpreting result text as markup', async () => {
  const store = useSearchDialogStore();
  store.setOpen(true);
  const wrapper = await mountSuspended(SearchDialog, { attachTo: document.body });
  try {
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input');
    if (!input) throw new Error('Search input is missing');
    input.value = 'guide';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const result = await vi.waitFor(() => {
      const element = document.getElementById('search-result-0');
      if (!element) throw new Error('Search result is missing');
      return element;
    });
    expect(result.textContent).toContain('Guide <example>');
    expect(result.textContent).toContain('Read the <em>GUIDE</em> & learn.');
    expect(result.querySelector('em')).toBeNull();
    expect(Array.from(result.querySelectorAll('mark'), (mark) => mark.textContent)).toEqual([
      'Guide',
      'Guide',
      'GUIDE',
    ]);
  } finally {
    wrapper.unmount();
    store.setOpen(false);
  }
});
