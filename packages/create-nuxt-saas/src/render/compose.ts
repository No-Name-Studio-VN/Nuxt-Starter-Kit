import { applyEdits, findNodeAtLocation, modify, parseTree } from 'jsonc-parser';
import { z } from 'zod';
import type { ProjectIdentity } from './render';

export interface Claims {
  dependencies: Set<string>;
  devDependencies: Set<string>;
  scripts: Set<string>;
}

const objectSchema = z.record(z.string(), z.unknown());

export function composePackageJson(raw: string, drop: Claims, identity: ProjectIdentity): string {
  const parsed: unknown = JSON.parse(raw);
  const value = objectSchema.parse(parsed);
  for (const [section, names] of Object.entries(drop)) {
    if (value[section] === undefined) continue;
    const entries = objectSchema.parse(value[section]);
    for (const name of names) Reflect.deleteProperty(entries, name);
    value[section] = entries;
  }
  value.name = identity.name;
  value.description = identity.description;
  value.version = '0.1.0';
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function composeEnvExample(raw: string, dropKeys: ReadonlySet<string>): string {
  const kept: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const key = /^\s*([A-Z_]\w*)=/i.exec(line)?.[1];
    if (key && dropKeys.has(key)) {
      while (kept.length > 0 && /^\s*#/.test(kept.at(-1) ?? '')) kept.pop();
      continue;
    }
    kept.push(line);
  }
  const collapsed: string[] = [];
  for (const line of kept) {
    if (line.trim() === '') {
      if (collapsed.at(-1) !== '') collapsed.push('');
    } else {
      collapsed.push(line);
    }
  }
  while (collapsed.at(-1) === '') collapsed.pop();
  return `${collapsed.join('\n')}\n`;
}

export function composeWrangler(
  raw: string,
  dropBindings: ReadonlySet<string>,
  identity: ProjectIdentity,
): string {
  const root = parseTree(raw, undefined, { allowTrailingComma: true });
  let output = raw;
  for (const property of root?.children ?? []) {
    const key: unknown = property.children?.[0]?.value;
    const value = property.children?.[1];
    if (typeof key !== 'string' || value?.type !== 'array') continue;
    // Remove highest indexes first so earlier removals cannot shift later targets.
    for (const [index, entry] of [...(value.children ?? []).entries()].reverse()) {
      if (entry.type !== 'object') continue;
      const binding: unknown = findNodeAtLocation(entry, ['binding'])?.value;
      if (typeof binding === 'string' && dropBindings.has(binding)) {
        output = applyEdits(output, modify(output, [key, index], undefined, {}));
      }
    }
  }
  output = applyEdits(output, modify(output, ['name'], identity.name, {}));
  output = applyEdits(output, modify(output, ['routes'], undefined, {}));
  return applyEdits(output, modify(output, ['route'], undefined, {}));
}
