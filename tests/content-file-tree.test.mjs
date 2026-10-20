import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { computed, defineComponent, reactive } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';

const source = readFileSync(
  new URL('../app/components/content/CtFileTree.vue', import.meta.url),
  'utf8',
);
const { descriptor } = parse(source);
const compiled = stripTypeScriptTypes(
  compileScript(descriptor, {
    id: 'file-tree-test',
    genDefaultAs: '__component',
  }).content,
).replace(/^import .* from .*$/gm, '');
// Exercise the compiled component setup, stubbing only its icon dependency.
const component = new Function(
  '_defineComponent',
  'computed',
  'useFileIcon',
  'CtIcon',
  `${compiled}\nreturn __component;`,
)(defineComponent, computed, (name, kind) => kind, {});

function setup(tree, autoSlash = true) {
  const props = reactive({ tree, autoSlash });
  const state = component.setup(props, { expose() {} });
  return { props, parsedTree: state.parsedTree };
}

test('missing, null, and malformed root trees do not throw', () => {
  for (const tree of [undefined, null, 'invalid YAML', {}, 42]) {
    assert.deepEqual(setup(tree).parsedTree.value, []);
  }
  assert.equal(component.props.tree.required, false);
  assert.deepEqual(component.props.tree.default(), []);
});

test('null folders remain folders and invalid array entries are ignored', () => {
  const { parsedTree } = setup([null, 42, [], { empty: null, nested: ['index.ts'] }]);
  assert.deepEqual(
    parsedTree.value.map((item) => item.title),
    ['empty/', 'nested/'],
  );
  assert.deepEqual(parsedTree.value[0].children, []);
  assert.equal(parsedTree.value[0].icon, 'folder');
  assert.equal(parsedTree.value[1].children[0].title, 'index.ts');
});

test('file highlights, diffs, autoSlash and reactive updates are preserved', () => {
  const { props, parsedTree } = setup(
    ['^app.vue^', '+ added.ts', '- removed.ts', { src: [] }],
    false,
  );
  assert.equal(parsedTree.value[0].title, 'app.vue');
  assert.equal(parsedTree.value[0].highlighted, true);
  assert.equal(parsedTree.value[1].diff, 'addition');
  assert.equal(parsedTree.value[2].diff, 'deletion');
  assert.equal(parsedTree.value[3].title, 'src');
  props.tree = null;
  assert.deepEqual(parsedTree.value, []);
  props.tree = ['updated.ts'];
  assert.equal(parsedTree.value[0].title, 'updated.ts');
});

const requireContent = createRequire(import.meta.resolve('@nuxt/content'));
const { parseMarkdown } = await import(
  join(dirname(requireContent.resolve('@nuxtjs/mdc')), 'runtime/parser/index.js')
);

function fileTrees(node) {
  return [
    ...(node.tag === 'ct-file-tree' ? [node] : []),
    ...(node.children ?? []).flatMap(fileTrees),
  ];
}

function validateTree(tree) {
  assert.ok(Array.isArray(tree));
  for (const item of tree) {
    if (typeof item === 'string') continue;
    assert.ok(item !== null && typeof item === 'object' && !Array.isArray(item));
    for (const children of Object.values(item)) {
      if (children !== null) validateTree(children);
    }
  }
}

for (const [path, count] of [
  ['1.getting-started/1.introduction.md', 1],
  ['2.components/2.docs/file-tree.md', 4],
  ['3.api/1.configuration/6.i18n.md', 1],
  ['3.api/3.advanced/1.override.md', 1],
]) {
  test(`MDC renders valid file-tree props in ${path}`, async () => {
    const markdown = readFileSync(new URL(`../content/docs/${path}`, import.meta.url), 'utf8');
    const { body } = await parseMarkdown(markdown, { highlight: false });
    const trees = fileTrees(body);
    assert.equal(trees.length, count);
    for (const tree of trees) {
      validateTree(JSON.parse(tree.props[':tree']));
    }
  });
}

test('docs navigation and GitHub CTA translation keys exist in both locales', () => {
  for (const locale of ['en', 'vi']) {
    const messages = JSON.parse(
      readFileSync(new URL(`../i18n/locales/${locale}.json`, import.meta.url), 'utf8'),
    );
    for (const key of ['docs', 'blog', 'previous', 'next']) assert.ok(messages.nav[key]);
    assert.ok(messages.cta.star_on_github);
  }
});
