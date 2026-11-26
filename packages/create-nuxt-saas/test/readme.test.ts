import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readKitModules, resolveSelection, validateSelection } from '../src/kit/modules';
import { parseModules } from '../src/prompts';
import { kitRoot } from './kit/imports';

const initExample =
  /\b(?:nuxt-saas\s+init|npm create nuxt-saas@\S+|pnpm dlx create-nuxt-saas@\S+\s+init)\b[^\n`]*?\s--modules(?:=|\s+)(?:'([^'\n]*)'|"([^"\n]*)"|([^\s`]+))/g;
const changeExample =
  /\b(?:nuxt-saas|pnpm dlx create-nuxt-saas@\S+)\s+(add|remove)[ \t]+(?:'([^'\r\n]*)'|"([^"\r\n]*)"|([^\s`]+))([^`\r\n]*)/g;

describe('README module examples', () => {
  it('uses selections accepted by the current kit', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    const modules = await readKitModules(kitRoot);
    const internal = new Set(
      modules.filter((module) => module.internal).map((module) => module.id),
    );
    const defaults = modules.filter((module) => module.installByDefault).map((module) => module.id);
    const commands = readme.replace(/\\\r?\n[ \t]*/g, ' ');
    const inits = [...commands.matchAll(initExample)];
    expect(inits.length).toBeGreaterThan(0);
    for (const [command, single, double, bare] of inits) {
      expect(() => {
        const requested = parseModules(single ?? double ?? bare ?? '');
        validateSelection(modules, resolveSelection(modules, [...defaults, ...requested]));
      }, command).not.toThrow();
    }

    // Each add/remove example block starts with a base project. Previews do not change it.
    for (const section of commands.split(/^```.*$/m)) {
      let installed = resolveSelection(modules, defaults);
      for (const [command, action, single, double, bare, rest] of section.matchAll(changeExample)) {
        const requested = parseModules(single ?? double ?? bare ?? '');
        expect(() => {
          let roots = [...installed, ...requested];
          if (action === 'remove') {
            expect(
              requested.every((id) => installed.includes(id)),
              'Modules must be installed',
            ).toBe(true);
            roots = installed.filter((id) => !internal.has(id) && !requested.includes(id));
          }
          const selection = resolveSelection(modules, roots);
          if (action === 'remove') {
            expect(
              requested.some((id) => selection.includes(id)),
              'Modules must not be required',
            ).toBe(false);
          }
          validateSelection(modules, selection);
          if (!rest?.split(/\s+/).includes('--check')) installed = selection;
        }, command).not.toThrow();
      }
    }
  });
});
