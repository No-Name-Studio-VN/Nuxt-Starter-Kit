import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNuxtConfig } from '@nuxt/kit';
import ts from 'typescript';
import { createSSRApp, h } from 'vue';
import { parse } from 'vue/compiler-sfc';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { locales } from '../../../i18n-constants';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function expressionKeys(source: string, jsx = false): string[] {
  const keys = new Set<string>();
  const ast = ts.createSourceFile(
    'translation.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ts.isElementAccessExpression(callee) &&
              callee.argumentExpression &&
              ts.isStringLiteralLike(callee.argumentExpression)
            ? callee.argumentExpression.text
            : '';
      const key = node.arguments[0];
      if ((name === 't' || name === '$t') && key) {
        function addLiteralKeys(expression: ts.Expression): void {
          if (ts.isStringLiteralLike(expression)) {
            keys.add(expression.text);
          } else if (ts.isConditionalExpression(expression)) {
            addLiteralKeys(expression.whenTrue);
            addLiteralKeys(expression.whenFalse);
          }
        }
        addLiteralKeys(key);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(ast);
  return [...keys];
}

function templateKeys(node: unknown): string[] {
  if (!isRecord(node)) return [];
  const keys: string[] = [];
  if (node.type === 4 && typeof node.content === 'string') {
    keys.push(...expressionKeys(node.content));
  }
  for (const field of ['children', 'props']) {
    const children = node[field];
    if (Array.isArray(children)) {
      for (const child of children) keys.push(...templateKeys(child));
    }
  }
  for (const field of ['content', 'exp', 'arg']) {
    keys.push(...templateKeys(node[field]));
  }
  return keys;
}

function sourceKeys(source: string, filename: string): string[] {
  if (!filename.endsWith('.vue')) return expressionKeys(source, /\.[jt]sx$/.test(filename));
  const { descriptor, errors } = parse(source, { filename });
  if (errors.length > 0) throw new Error(`Cannot parse ${filename}: ${errors.join(', ')}`);
  return [
    ...expressionKeys(
      descriptor.script?.content ?? '',
      ['jsx', 'tsx'].includes(descriptor.script?.lang ?? ''),
    ),
    ...expressionKeys(
      descriptor.scriptSetup?.content ?? '',
      ['jsx', 'tsx'].includes(descriptor.scriptSetup?.lang ?? ''),
    ),
    ...templateKeys(descriptor.template?.ast),
  ];
}

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.nuxt', '.output', '.git', 'test'].includes(entry.name)) {
        files.push(...(await sourceFiles(path)));
      }
    } else if (/\.(?:vue|[cm]?[jt]sx?)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(path);
    }
  }
  return files;
}

function mergeMessages(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    const previous = target[key];
    if (isRecord(value)) {
      const nested = isRecord(previous) ? previous : {};
      mergeMessages(nested, value);
      target[key] = nested;
    } else {
      target[key] = value;
    }
  }
}

function localeFile(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (isRecord(entry) && typeof entry.path === 'string') return entry.path;
  throw new Error('Unsupported registered locale file');
}

async function registeredMessages() {
  const config = await loadNuxtConfig({ cwd: root });
  const layerDirectories = (await readdir(join(root, 'layers'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, 'layers', entry.name));
  expect(config._layers.map((layer) => layer.config.rootDir)).toEqual(
    expect.arrayContaining(layerDirectories),
  );
  const messages: Record<string, Record<string, unknown>> = {};
  const files = new Set<string>();

  // Nuxt i18n gives earlier layers priority; later files within one locale override earlier files.
  for (const layer of [...config._layers].reverse()) {
    const layerConfig: unknown = layer.config;
    const i18n = isRecord(layerConfig) ? layerConfig.i18n : undefined;
    if (!isRecord(i18n) || !Array.isArray(i18n.locales)) continue;
    const directory = resolve(
      layer.config.rootDir,
      typeof i18n.restructureDir === 'string' ? i18n.restructureDir : 'i18n',
      typeof i18n.langDir === 'string' ? i18n.langDir : 'locales',
    );
    for (const locale of i18n.locales) {
      if (!isRecord(locale) || typeof locale.code !== 'string')
        throw new Error('Locales must declare a code and files');
      const entries: unknown[] = Array.isArray(locale.files)
        ? locale.files
        : locale.file
          ? [locale.file]
          : [];
      for (const entry of entries) {
        const path = resolve(directory, localeFile(entry));
        const content: unknown = JSON.parse(await readFile(path, 'utf8'));
        if (!isRecord(content)) throw new Error(`Invalid locale catalog: ${path}`);
        const merged = messages[locale.code] ?? {};
        mergeMessages(merged, content);
        messages[locale.code] = merged;
        files.add(path);
      }
    }
  }
  return { messages, files };
}

describe('translation coverage', () => {
  it('discovers both literal branches of conditional translation keys', () => {
    expect(expressionKeys("t(backup ? 'auth.backup' : 'auth.totp')").sort()).toEqual([
      'auth.backup',
      'auth.totp',
    ]);
  });

  it('discovers literal calls in scripts, interpolations and directives without treating comments or text as calls', () => {
    const source =
      '<script setup lang="ts">\n// t("ignored.comment")\nconst text = "t(\\\"ignored.string\\\")";\nconst label = i18n.t(\n`script.key`\n);\nconst other = nuxtApp.$i18n.t("nested.key");\n</script>\n<template>\n<!-- $t("ignored.html") -->\n<p :title="$t(\'directive.key\')">{{ t("template.key") }}</p>\n<p>{{ i18n?.t(\'optional.key\') }} {{ i18n[\'t\'](\'bracket.key\') }}</p>\n<p>{{ t(dynamicKey) }} {{ t(`dynamic.${value}`) }}</p>\n<p>t("ignored.text")</p>\n</template>';
    expect(sourceKeys(source, 'fixture.vue').sort()).toEqual([
      'bracket.key',
      'directive.key',
      'nested.key',
      'optional.key',
      'script.key',
      'template.key',
    ]);
  });

  it('resolves every statically-used key in each locale using only registered base and layer catalogs, including SSR', async () => {
    const { messages, files } = await registeredMessages();
    const usages = new Map<string, Set<string>>();
    const paths: string[] = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && ['app', 'shared', 'server', 'layers'].includes(entry.name)) {
        paths.push(...(await sourceFiles(join(root, entry.name))));
      } else if (
        entry.isFile() &&
        /\.[cm]?[jt]sx?$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts')
      ) {
        paths.push(join(root, entry.name));
      }
    }
    for (const path of paths) {
      for (const key of sourceKeys(await readFile(path, 'utf8'), path)) {
        const locations = usages.get(key) ?? new Set<string>();
        locations.add(relative(root, path));
        usages.set(key, locations);
      }
    }
    expect(usages.size).toBeGreaterThan(0);
    // Resolve the same vue-i18n dependency Nuxt i18n uses, without adding a test-only dependency.
    const runtime: unknown = require(
      require.resolve('vue-i18n', { paths: [require.resolve('@nuxtjs/i18n')] }),
    );
    if (!isRecord(runtime) || typeof runtime.createI18n !== 'function')
      throw new Error('Missing Vue i18n runtime');

    for (const locale of locales) {
      expect(files.has(join(root, 'i18n/locales', `${locale}.json`))).toBe(true);
      const i18n: unknown = runtime.createI18n({
        legacy: false,
        locale,
        fallbackLocale: false,
        messages,
      });
      if (!isRecord(i18n) || !isRecord(i18n.global)) throw new Error('Missing i18n composer');
      const composer = i18n.global;
      const { te, t } = composer;
      if (typeof te !== 'function' || typeof t !== 'function')
        throw new Error('Missing translation methods');
      const missing = [...usages]
        .filter(([key]) => !te(key, locale))
        .map(([key, locations]) => `${locale}: ${key} (${[...locations].join(', ')})`);
      expect(missing, 'Static keys must resolve without locale fallback').toEqual([]);
      const rendered: string[] = [];
      for (const key of usages.keys()) {
        const value: unknown = t(key, { selected: 1, total: 2, year: 2026 });
        expect(typeof value, `${locale}: ${key}`).toBe('string');
        if (typeof value !== 'string') throw new Error(`Invalid translation: ${locale}.${key}`);
        expect(value.trim(), `${locale}: ${key}`).not.toBe('');
        expect(value, `${locale}: ${key}`).not.toBe(key);
        rendered.push(value);
      }
      const html = await renderToString(
        createSSRApp({
          render: () =>
            h(
              'main',
              rendered.map((value) => h('p', value)),
            ),
        }),
      );
      expect(html).toContain('<main>');
      expect(html.match(/<p>/g)?.length).toBe(usages.size);
    }
  }, 30000);
});
