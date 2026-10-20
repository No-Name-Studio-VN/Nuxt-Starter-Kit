import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import {
  computed,
  defineComponent,
  effectScope,
  nextTick,
  onScopeDispose,
  reactive,
  shallowRef,
  watch,
} from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { Window } from 'happy-dom';

const source = readFileSync(new URL('../app/composables/useDocsToc.ts', import.meta.url), 'utf8');
const compiled = stripTypeScriptTypes(source)
  .replace(/^import .*;$/gm, '')
  .replace('export function useDocsToc', 'function useDocsToc');

function setup(value = null, html = '') {
  const page = shallowRef(value);
  const route = reactive({ path: '/docs/first' });
  const document = new Window().document;
  document.body.innerHTML = html;
  let mount;
  let finish;
  let disposed = false;
  const scope = effectScope();
  const factory = new Function(
    'computed',
    'shallowRef',
    'watch',
    'nextTick',
    'onMounted',
    'onScopeDispose',
    'usePageData',
    'useRoute',
    'useNuxtApp',
    'document',
    `${compiled}\nreturn useDocsToc;`,
  )(
    computed,
    shallowRef,
    watch,
    nextTick,
    (callback) => {
      mount = callback;
    },
    onScopeDispose,
    () => ({ page }),
    () => route,
    () => ({
      hook(name, callback) {
        assert.equal(name, 'page:finish');
        finish = callback;
        return () => {
          disposed = true;
        };
      },
    }),
    document,
  );
  const state = scope.run(factory);
  return {
    page,
    route,
    document,
    state,
    mount: () => mount(),
    finish: () => finish(),
    stop: () => scope.stop(),
    disposed: () => disposed,
  };
}

const heading = (id, text = id, depth = 2) => ({ id, text, depth, children: [] });

test('parsed Markdown TOC is available before mount, including toc: true pages', () => {
  const ctx = setup({
    toc: true,
    body: { toc: { links: [heading('intro'), heading('hide-toc')] } },
  });
  assert.equal(ctx.state.pending.value, false);
  assert.deepEqual(
    ctx.state.tocLinks.value.map((link) => link.id),
    ['intro'],
  );
  ctx.stop();
});

test('frontmatter links take precedence and empty parsed TOCs do not load forever', () => {
  const ctx = setup({
    toc: { links: [heading('custom')] },
    body: { toc: { links: [heading('body')] } },
  });
  assert.equal(ctx.state.tocLinks.value[0].id, 'custom');
  ctx.page.value = { body: { toc: { links: [] } } };
  assert.equal(ctx.state.pending.value, false);
  assert.deepEqual(ctx.state.tocLinks.value, []);
  ctx.stop();
});

test('loading remains pending until suspended content finishes rendering', async () => {
  const ctx = setup({ toc: true, body: {} });
  assert.equal(ctx.state.pending.value, true);
  ctx.mount();
  await nextTick();
  assert.equal(ctx.state.pending.value, true);
  ctx.document.body.innerHTML =
    '<div class="docs-content"><h2 id="intro">Intro</h2><h3>Details</h3><h2 id="next">Next</h2></div>';
  ctx.finish();
  assert.equal(ctx.state.pending.value, false);
  assert.deepEqual(
    ctx.state.tocLinks.value.map((link) => link.id),
    ['intro', 'next'],
  );
  assert.equal(ctx.state.tocLinks.value[0].children[0].id, 'details');
  assert.equal(ctx.document.querySelector('h3').id, 'details');
  ctx.stop();
  assert.equal(ctx.disposed(), true);
});

test('DOM fallback clears old headings on navigation and settles for headingless pages', async () => {
  const ctx = setup({ body: {} }, '<div class="docs-content"><h2 id="first">First</h2></div>');
  ctx.mount();
  await nextTick();
  assert.equal(ctx.state.tocLinks.value[0].id, 'first');
  ctx.document.body.innerHTML = '';
  ctx.route.path = '/docs/next';
  ctx.page.value = { body: {} };
  await nextTick();
  assert.deepEqual(ctx.state.tocLinks.value, []);
  assert.equal(ctx.state.pending.value, true);
  ctx.document.body.innerHTML = '<div class="docs-content"><p>No headings</p></div>';
  ctx.finish();
  assert.equal(ctx.state.pending.value, false);
  assert.deepEqual(ctx.state.tocLinks.value, []);
  ctx.stop();
});

test('missing and malformed TOCs safely fall back to loading', () => {
  for (const value of [
    null,
    { toc: true },
    { toc: { links: 'bad' } },
    { toc: { links: [null, 42] } },
  ]) {
    const ctx = setup(value);
    assert.deepEqual(ctx.state.tocLinks.value, []);
    assert.equal(ctx.state.pending.value, true);
    ctx.stop();
  }
});

test('component-generated headings still work when the parsed Markdown TOC is empty', async () => {
  const ctx = setup(
    { toc: { links: [] }, body: { toc: { links: [] } } },
    '<div class="docs-content"><h2 id="component-heading">Component heading</h2></div>',
  );
  assert.equal(ctx.state.pending.value, false);
  ctx.mount();
  await nextTick();
  assert.equal(ctx.state.tocLinks.value[0].id, 'component-heading');
  ctx.stop();
});

test('sidebar keeps its hydration skeleton, then distinguishes loading from empty navigation', () => {
  const source = readFileSync(
    new URL('../app/components/layout/Aside.vue', import.meta.url),
    'utf8',
  );
  const { descriptor } = parse(source);
  const script = stripTypeScriptTypes(
    compileScript(descriptor, {
      id: 'aside-loading-test',
      genDefaultAs: '__component',
    }).content,
  ).replace(/^import .* from .*$/gm, '');
  const navigation = shallowRef([{ path: '/docs', title: 'Docs' }]);
  let mount;
  const component = new Function(
    '_defineComponent',
    'computed',
    'shallowRef',
    'onMounted',
    'useRoute',
    'useConfig',
    'useI18n',
    'useContentHelpers',
    'usePageData',
    'CtIcon',
    `${script}\nreturn __component;`,
  )(
    defineComponent,
    computed,
    shallowRef,
    (callback) => {
      mount = callback;
    },
    () => ({ path: '/docs' }),
    () => shallowRef({ aside: { useLevel: false } }),
    () => ({ locale: shallowRef('vi'), defaultLocale: 'vi' }),
    () => ({ navDirFromPath: () => [] }),
    () => ({ navigation }),
    {},
  );
  const state = component.setup({ isMobile: false }, { expose() {} });
  assert.equal(state.navigationReady.value, false, 'payload must not change the hydration markup');
  mount();
  assert.equal(state.navigationReady.value, true);
  navigation.value = null;
  assert.equal(state.navigationReady.value, false);
  navigation.value = [];
  assert.equal(state.navigationReady.value, true, 'empty/error result must not leave a skeleton');
});
