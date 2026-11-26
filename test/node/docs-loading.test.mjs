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
import * as contentPaths from '../../layers/content/app/utils/contentPaths.ts';

const source = readFileSync(
  new URL('../../layers/content/app/composables/useDocsToc.ts', import.meta.url),
  'utf8',
);
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

test('sidebar renders prefetched navigation and distinguishes loading from empty results', () => {
  const source = readFileSync(
    new URL('../../layers/content/app/components/layout/Aside.vue', import.meta.url),
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
  const component = new Function(
    '_defineComponent',
    'computed',
    'useDocsConfig',
    'useContentHelpers',
    'useI18nDocs',
    'CtIcon',
    `${script}\nreturn __component;`,
  )(
    defineComponent,
    computed,
    () => shallowRef({ aside: { useLevel: false } }),
    () => ({ navDirFromPath: () => [] }),
    () => ({ navigation, path: shallowRef('/docs') }),
    {},
  );
  const state = component.setup({ isMobile: false }, { expose() {} });
  assert.equal(state.navigationReady.value, true, 'prefetched data can render on the server');
  navigation.value = null;
  assert.equal(state.navigationReady.value, false);
  navigation.value = [];
  assert.equal(state.navigationReady.value, true, 'empty/error result must not leave a skeleton');
});

function loadContentFunctions(file, names, globals = {}) {
  globals = { ...contentPaths, ...globals };
  const source = readFileSync(new URL(`../../layers/content/app/${file}`, import.meta.url), 'utf8');
  const compiled = stripTypeScriptTypes(source)
    .replace(/^import [\s\S]*? from [^\n]+;$/gm, '')
    .replace(/^export (?=(?:async )?function )/gm, '');
  return new Function(
    ...Object.keys(globals),
    `${compiled}
return { ${names.join(', ')} };`,
  )(...Object.values(globals));
}

function mockLocale() {
  return { locale: shallowRef('vi'), defaultLocale: 'en', availableLocales: ['en', 'vi'] };
}

function setupPageContent(pages) {
  const queries = [];
  const { useDocsPageContent } = loadContentFunctions(
    'composables/usePageData.ts',
    ['useDocsPageContent'],
    {
      useI18n: mockLocale,
      useAsyncData: async (key, load) => ({
        key,
        data: await load({ runWithContext: (callback) => callback() }),
      }),
      queryCollection: () => ({
        path(path) {
          queries.push(path);
          return { first: async () => pages[path] ?? null };
        },
      }),
    },
  );
  return { useDocsPageContent, queries };
}

const docsPath = '/docs/getting-started/introduction';
const englishPage = { path: docsPath, title: 'Introduction' };
const localizedPage = { path: `/vi${docsPath}`, title: 'Giới thiệu' };

test('a localized docs page wins, including the trailing-slash retry', async () => {
  const { useDocsPageContent, queries } = setupPageContent({
    [docsPath]: englishPage,
    [`/vi${docsPath}`]: localizedPage,
  });
  const path = `/vi${docsPath}/`;
  const { key, data } = await useDocsPageContent(path);
  assert.equal(key, `docs-page:${path}`);
  assert.deepEqual(data, { page: localizedPage, isFallback: false });
  assert.deepEqual(queries, [path, `/vi${docsPath}`]);
});

test('missing translations render the default page and are flagged as fallback', async () => {
  const { useDocsPageContent } = setupPageContent({ [docsPath]: englishPage });
  const { data } = await useDocsPageContent(`/vi${docsPath}/`);
  assert.deepEqual(data, { page: englishPage, isFallback: true });
});

test('default locale pages are not flagged and locale-like slugs are preserved', async () => {
  const path = '/docs/vi';
  const page = { path, title: 'Locale identifiers' };
  const { useDocsPageContent } = setupPageContent({ [path]: page });
  assert.deepEqual((await useDocsPageContent(path)).data, { page, isFallback: false });
  assert.deepEqual((await useDocsPageContent(`/vi${path}`)).data, { page, isFallback: true });
});

test('docs loading returns null when neither locale has the path', async () => {
  const { useDocsPageContent } = setupPageContent({ [docsPath]: englishPage });
  assert.equal((await useDocsPageContent('/vi/docs/does-not-exist')).data, null);
});

test('a partial docs translation overlays default navigation without losing siblings', () => {
  const i18n = mockLocale();
  const { useI18nDocs } = loadContentFunctions('composables/useI18nDocs.ts', ['useI18nDocs'], {
    computed,
    useI18n: () => i18n,
    useRoute: () => ({ path: `/vi${docsPath}/` }),
    usePageData: () => ({ navigation }),
  });
  const setupPath = '/docs/getting-started/setup';
  const defaultSetup = { path: setupPath, title: 'Setup' };
  const localizedOnly = { path: '/vi/docs/getting-started/locale-guide', title: 'Hướng dẫn' };
  const defaultTree = {
    path: '/docs',
    title: 'Docs',
    redirect: docsPath,
    children: [
      {
        path: '/docs/getting-started',
        title: 'Getting started',
        children: [englishPage, defaultSetup],
      },
    ],
  };
  const localizedTree = {
    path: '/vi',
    title: 'Vi',
    children: [
      {
        path: '/vi/docs',
        title: 'Tài liệu',
        children: [
          {
            path: '/vi/docs/getting-started',
            title: 'Bắt đầu',
            children: [localizedPage, localizedOnly],
          },
        ],
      },
    ],
  };
  const navigation = shallowRef([defaultTree, localizedTree]);
  const { navigation: result, path } = useI18nDocs();
  assert.equal(path.value, docsPath);
  const root = result.value[0];
  assert.equal(root.title, 'Tài liệu');
  assert.equal(root.path, '/docs');
  assert.equal(root.redirect, docsPath);
  assert.deepEqual(root.children[0].children, [
    { ...localizedPage, path: docsPath },
    defaultSetup,
    { ...localizedOnly, path: '/docs/getting-started/locale-guide' },
  ]);
  assert.equal(localizedPage.path, `/vi${docsPath}`, 'the original tree is not changed');
  i18n.locale.value = 'en';
  assert.deepEqual(result.value, [defaultTree]);
  i18n.locale.value = 'vi';
  navigation.value = [defaultTree];
  assert.deepEqual(
    result.value,
    [defaultTree],
    'without translations the full default tree is visible',
  );
});

test('the locale root is not treated as a missing Markdown page translation', async () => {
  const { useDocsPageContent } = setupPageContent({ '/': { path: '/' } });
  assert.equal((await useDocsPageContent('/vi')).data, null);
  assert.equal((await useDocsPageContent('/vi/')).data, null);
});

test('search indexes translated sections instead of stale default anchors for the same page', () => {
  const { localizeSearchSections } = loadContentFunctions('utils/contentSearch.ts', [
    'localizeSearchSections',
  ]);
  const sections = [
    { id: docsPath, title: 'Introduction' },
    { id: `${docsPath}#english`, title: 'English heading' },
    { id: '/docs/vi#details', title: 'Locale identifiers' },
    { id: `/vi${docsPath}`, title: 'Giới thiệu' },
    { id: `/vi${docsPath}#tieng-viet`, title: 'Tiếng Việt' },
  ];
  assert.deepEqual(localizeSearchSections(sections, 'vi', 'en', ['en', 'vi']), [
    { id: '/docs/vi#details', title: 'Locale identifiers' },
    { id: docsPath, title: 'Giới thiệu' },
    { id: `${docsPath}#tieng-viet`, title: 'Tiếng Việt' },
  ]);
  assert.deepEqual(
    localizeSearchSections(sections, 'en', 'en', ['en', 'vi']),
    sections.slice(0, 3),
  );
});

test('navigation links for structural folders point to a real descendant page', () => {
  const { navTargetFromPath } = loadContentFunctions('composables/useContentHelpers.ts', [
    'navTargetFromPath',
  ]);
  const tree = [
    {
      path: '/docs',
      title: 'Docs',
      page: false,
      children: [
        {
          path: '/docs/getting-started',
          title: 'Getting started',
          page: false,
          children: [englishPage],
        },
      ],
    },
  ];
  assert.equal(navTargetFromPath('/docs', tree), docsPath);
  assert.equal(navTargetFromPath('/docs/getting-started', tree), docsPath);
  assert.equal(navTargetFromPath(docsPath, tree), docsPath);
});
