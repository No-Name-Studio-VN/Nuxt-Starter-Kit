# Modular CLI — Plan 1: Foundation and Generation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `packages/create-nuxt-starter` in strict TypeScript so `nuxt-starter init` generates a Nuxt project containing exactly the modules the user picked, extracted from a pinned kit revision, with a project manifest that later plans use to upgrade it.

**Architecture:** The kit repo stays one integrated app. A registry declares which kit paths each module owns; `// <nsk:auth>` marker blocks in kit source delimit module fragments inside shared files. Rendering = copy owned files + delete unselected modules' marker blocks + substitute literal placeholder tokens. Rendering is deliberately dumb and deterministic: Plan 2's three-way merge depends on today's CLI reproducing an old render byte-for-byte.

**Tech Stack:** TypeScript (strict), unbuild (ESM → `dist/`), vitest, zod v4 (validation at trust boundaries), citty (commands), @clack/prompts (interactive), giget (fetch pinned kit revisions), tinyglobby (path globs).

**Spec:** `docs/superpowers/specs/2026-08-12-modular-cli-design.md`

## Plan sequence

This spec is split into three plans. Each produces working, testable software.

1. **Plan 1 (this document)** — package skeleton, registry v2, markers, rendering, manifest, `init`. Deliverable: generating modular projects works.
2. **Plan 2 — upgrade engine.** Three-way merge via `git merge-file`, structured JSON merge, upgrade planner/apply, `upgrade`/`status`/`diff` commands.
3. **Plan 3 — kit modularization.** Annotate the real starter kit with markers, assign kit paths to modules, author the real registry, `add`/`remove`, CI generation matrix and registry↔kit consistency check.

Plans 1 and 2 are validated entirely against a miniature fixture kit, so neither depends on the real kit being modularized yet.

## Global Constraints

- Package directory: `packages/create-nuxt-starter`. It is standalone — its own `tsconfig.json`, own scripts. The root tsconfig is Nuxt-managed (`files: []`, project references) and must not be modified.
- Node `>=22.0.0`. ESM only (`"type": "module"`).
- TypeScript strict, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`. `npm run typecheck` must pass at the end of every task.
- Module resolution is `Bundler`; unbuild bundles, so intra-package imports carry **no** file extension.
- zod `^4.4.3`, vitest `^4.1.10` (match the repo root versions).
- Marker token syntax is `<nsk:module-id>` … `</nsk:module-id>`, matched anywhere on a line regardless of surrounding comment characters. Module ids match `/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9]+)?$/`.
- Placeholder tokens are literal `{{UPPER_SNAKE}}`. No regex rewriting of kit content, ever — it would break Plan 2's merges.
- Every user-facing failure throws `CliError`; the CLI prints its message without a stack trace. Bugs (non-`CliError`) keep their stack.
- Commit after every task with the message given in its final step.

---

### Task 1: TypeScript package skeleton

Replaces V1's `.mjs` sources. The package is intentionally non-functional until Task 12 wires the CLI back up; V1 is unreleased, so there is nothing to keep working in the meantime.

**Files:**

- Modify: `packages/create-nuxt-starter/package.json`
- Create: `packages/create-nuxt-starter/tsconfig.json`
- Create: `packages/create-nuxt-starter/build.config.ts`
- Create: `packages/create-nuxt-starter/vitest.config.ts`
- Create: `packages/create-nuxt-starter/src/errors.ts`
- Create: `packages/create-nuxt-starter/test/errors.test.ts`
- Delete: `packages/create-nuxt-starter/src/*.mjs`, `packages/create-nuxt-starter/test/registry-upgrade.test.mjs`, `packages/create-nuxt-starter/registry/registry.json`, `packages/create-nuxt-starter/registry/templates/`

**Interfaces:**

- Produces: `class CliError extends Error` with `readonly name = 'CliError'`. Every later task imports it from `../src/errors`.

- [ ] **Step 1: Remove the V1 implementation**

```bash
cd packages/create-nuxt-starter
git rm -r --quiet src registry test
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@no-name-studio/create-nuxt-starter",
  "version": "0.2.0",
  "description": "Create and upgrade modular Nuxt Starter Kit projects.",
  "license": "MIT",
  "type": "module",
  "bin": { "nuxt-starter": "./bin/nuxt-starter.mjs" },
  "files": ["bin", "dist", "registry", "README.md"],
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "build": "unbuild",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@clack/prompts": "^1.7.0",
    "citty": "^0.1.6",
    "giget": "^2.0.0",
    "tinyglobby": "^0.2.15",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.9.0",
    "unbuild": "^3.5.0",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test", "build.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write `build.config.ts` and `vitest.config.ts`**

```ts
// build.config.ts
import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['src/cli'],
  clean: true,
  declaration: false,
  rollup: { inlineDependencies: false, esbuild: { target: 'node22' } },
});
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 5: Write the failing test**

```ts
// test/errors.test.ts
import { describe, expect, it } from 'vitest';
import { CliError } from '../src/errors';

describe('CliError', () => {
  it('carries a message and is identifiable by name', () => {
    const error = new CliError('registry is missing');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CliError');
    expect(error.message).toBe('registry is missing');
  });
});
```

- [ ] **Step 6: Install dependencies and run the test to verify it fails**

Run: `npm install && npx vitest run`
Expected: FAIL — `Failed to resolve import "../src/errors"`.

- [ ] **Step 7: Write `src/errors.ts`**

```ts
/** An expected, user-facing failure. The CLI prints these without a stack trace. */
export class CliError extends Error {
  override readonly name = 'CliError';
}
```

- [ ] **Step 8: Verify the test passes and typecheck is clean**

Run: `npx vitest run && npm run typecheck`
Expected: 1 test passes; `tsc` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add -A packages/create-nuxt-starter
git commit -m "refactor(cli): replace V1 sources with a strict TypeScript skeleton"
```

---

### Task 2: Path safety utilities

Security-critical: everything that writes a file resolves its path through `resolveInside` first. Ported from V1's `files.mjs` with types.

**Files:**

- Create: `packages/create-nuxt-starter/src/util/paths.ts`
- Create: `packages/create-nuxt-starter/test/util/paths.test.ts`

**Interfaces:**

- Consumes: `CliError` from Task 1.
- Produces:
  - `toPosixPath(value: string): string`
  - `assertRelativePath(value: string, field: string): void`
  - `resolveInside(root: string, path: string, field: string): string` — throws `CliError` if the result escapes `root`.

- [ ] **Step 1: Write the failing test**

```ts
// test/util/paths.test.ts
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { assertRelativePath, resolveInside, toPosixPath } from '../../src/util/paths';

describe('toPosixPath', () => {
  it('normalises separators to forward slashes', () => {
    expect(toPosixPath('app/components/Button.vue')).toBe('app/components/Button.vue');
  });
});

describe('assertRelativePath', () => {
  it.each([
    ['', 'empty'],
    ['/etc/passwd', 'absolute'],
    ['../secrets', 'parent traversal'],
    ['app/../../secrets', 'embedded traversal'],
    ['app\\..\\..\\secrets', 'windows-style traversal'],
  ])('rejects %s (%s)', (value) => {
    expect(() => assertRelativePath(value, 'Module path')).toThrow(CliError);
  });

  it('accepts a nested relative path', () => {
    expect(() => assertRelativePath('app/components/Button.vue', 'Module path')).not.toThrow();
  });
});

describe('resolveInside', () => {
  it('resolves a relative path against the root', () => {
    expect(resolveInside('/tmp/project', 'app/app.vue', 'Generated file')).toBe(
      resolve('/tmp/project/app/app.vue'),
    );
  });

  it('refuses to escape the root', () => {
    expect(() => resolveInside('/tmp/project', '../outside', 'Generated file')).toThrow(CliError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/util/paths.test.ts`
Expected: FAIL — cannot resolve `../../src/util/paths`.

- [ ] **Step 3: Write `src/util/paths.ts`**

```ts
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { CliError } from '../errors';

export function toPosixPath(value: string): string {
  return value.split(sep).join('/');
}

function isInside(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

export function assertRelativePath(value: string, field: string): void {
  if (value.length === 0 || isAbsolute(value)) {
    throw new CliError(`${field} must be a non-empty relative path.`);
  }
  if (value.split(/[\\/]/).includes('..')) {
    throw new CliError(`${field} cannot leave its root.`);
  }
}

export function resolveInside(root: string, path: string, field: string): string {
  assertRelativePath(path, field);
  const resolved = resolve(root, path);
  if (!isInside(resolve(root), resolved)) {
    throw new CliError(`${field} must stay inside ${root}.`);
  }
  return resolved;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/util/paths.test.ts && npm run typecheck`
Expected: PASS (8 assertions), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/util/paths.ts packages/create-nuxt-starter/test/util/paths.test.ts
git commit -m "feat(cli): add path safety utilities"
```

---

### Task 3: Filesystem helpers

**Files:**

- Create: `packages/create-nuxt-starter/src/util/fs.ts`
- Create: `packages/create-nuxt-starter/test/util/fs.test.ts`

**Interfaces:**

- Consumes: `CliError`, `resolveInside`.
- Produces:
  - `pathExists(path: string): Promise<boolean>`
  - `listFiles(root: string): Promise<string[]>` — posix-relative paths, sorted, recursive; throws `CliError` on symlinks.
  - `readTextFile(path: string): Promise<string | null>` — `null` when the content contains a NUL byte (binary).
  - `writeTextFile(path: string, contents: string): Promise<void>` — creates parent directories.
  - `writeJsonAtomically(path: string, value: unknown): Promise<void>` — temp file + rename.
  - `hashContent(contents: string | Buffer): string` — `sha256:<hex>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/util/fs.test.ts
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import {
  hashContent,
  listFiles,
  pathExists,
  readTextFile,
  writeJsonAtomically,
  writeTextFile,
} from '../../src/util/fs';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nsk-fs-'));
});

describe('listFiles', () => {
  it('lists nested files as sorted posix paths', async () => {
    await writeTextFile(join(root, 'b.txt'), 'b');
    await writeTextFile(join(root, 'app/a.vue'), 'a');
    expect(await listFiles(root)).toEqual(['app/a.vue', 'b.txt']);
  });

  it('rejects symlinks', async () => {
    await writeTextFile(join(root, 'real.txt'), 'x');
    await symlink(join(root, 'real.txt'), join(root, 'link.txt'));
    await expect(listFiles(root)).rejects.toThrow(CliError);
  });
});

describe('readTextFile', () => {
  it('returns null for binary content', async () => {
    await writeFile(join(root, 'bin'), Buffer.from([0x41, 0x00, 0x42]));
    expect(await readTextFile(join(root, 'bin'))).toBeNull();
  });

  it('returns text content', async () => {
    await writeTextFile(join(root, 'a.txt'), 'hello');
    expect(await readTextFile(join(root, 'a.txt'))).toBe('hello');
  });
});

describe('pathExists', () => {
  it('reports presence', async () => {
    await writeTextFile(join(root, 'a.txt'), 'x');
    expect(await pathExists(join(root, 'a.txt'))).toBe(true);
    expect(await pathExists(join(root, 'missing.txt'))).toBe(false);
  });
});

describe('writeJsonAtomically', () => {
  it('writes pretty JSON with a trailing newline', async () => {
    const target = join(root, 'nested/manifest.json');
    await writeJsonAtomically(target, { a: 1 });
    expect(await readFile(target, 'utf8')).toBe('{\n  "a": 1\n}\n');
  });
});

describe('hashContent', () => {
  it('is stable and prefixed', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
    expect(hashContent('abc')).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashContent('abc')).not.toBe(hashContent('abd'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/util/fs.test.ts`
Expected: FAIL — cannot resolve `../../src/util/fs`.

- [ ] **Step 3: Write `src/util/fs.ts`**

```ts
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { CliError } from '../errors';

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function listFiles(root: string): Promise<string[]> {
  async function visit(directory: string, prefix: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new CliError(`Unsupported symbolic link: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        files.push(...(await visit(resolve(directory, entry.name), relativePath)));
        continue;
      }
      if (!entry.isFile()) {
        throw new CliError(`Unsupported file type: ${relativePath}`);
      }
      files.push(relativePath);
    }
    return files;
  }
  return visit(root, '');
}

export async function readTextFile(path: string): Promise<string | null> {
  const contents = await readFile(path);
  if (contents.includes(0)) return null;
  return contents.toString('utf8');
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

export async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporaryPath = resolve(directory, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

export function hashContent(contents: string | Buffer): string {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/util/fs.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/util/fs.ts packages/create-nuxt-starter/test/util/fs.test.ts
git commit -m "feat(cli): add filesystem helpers"
```

---

### Task 4: Registry v2 schema and loader

The registry is a trust boundary: it ships in the package but may be overridden with `--registry`. zod parses it, and the inferred types are the source of truth everywhere downstream.

**Files:**

- Create: `packages/create-nuxt-starter/src/registry/schema.ts`
- Create: `packages/create-nuxt-starter/src/registry/load.ts`
- Create: `packages/create-nuxt-starter/test/registry/load.test.ts`

**Interfaces:**

- Produces:
  - `type RegistryModule = { id, title, description, version, requires: string[], conflicts: string[], paths: string[], structured: Record<string, Record<string, unknown>>, env: string[], notes: string[] }`
  - `type Registry = { schemaVersion: 2, version: string, kit: { template: string, revision: string }, modules: RegistryModule[] }`
  - `parseRegistry(value: unknown, sourceLabel: string): Registry`
  - `loadRegistry(registryPath?: string): Promise<Registry>` — defaults to the bundled `registry/registry.json`.
  - `getModule(registry: Registry, id: string): RegistryModule` — throws `CliError` for unknown ids.

- [ ] **Step 1: Write the failing test**

```ts
// test/registry/load.test.ts
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { getModule, parseRegistry } from '../../src/registry/schema';

function registry(modules: unknown[]) {
  return {
    schemaVersion: 2,
    version: '1.0.0',
    kit: { template: 'github:No-Name-Studio-VN/Nuxt-Starter-Kit', revision: 'abc1234' },
    modules,
  };
}

const base = {
  id: 'base',
  title: 'Base',
  description: 'Foundation',
  version: '1.0.0',
  paths: ['nuxt.config.ts'],
};

describe('parseRegistry', () => {
  it('applies defaults for optional collections', () => {
    const parsed = parseRegistry(registry([base]), 'test');
    const parsedModule = parsed.modules[0]!;
    expect(parsedModule.requires).toEqual([]);
    expect(parsedModule.conflicts).toEqual([]);
    expect(parsedModule.env).toEqual([]);
    expect(parsedModule.notes).toEqual([]);
    expect(parsedModule.structured).toEqual({});
  });

  it('keeps declared dependency and structured data', () => {
    const parsed = parseRegistry(
      registry([
        base,
        {
          id: 'auth',
          title: 'Auth',
          description: 'Sessions',
          version: '1.0.0',
          paths: ['server/api/auth/**'],
          requires: ['base'],
          structured: { 'package.json': { dependencies: { 'nuxt-auth-utils': '^0.5.29' } } },
          env: ['NUXT_SESSION_PASSWORD'],
        },
      ]),
      'test',
    );
    expect(parsed.modules[1]!.requires).toEqual(['base']);
    expect(parsed.modules[1]!.structured['package.json']).toEqual({
      dependencies: { 'nuxt-auth-utils': '^0.5.29' },
    });
  });

  it.each([
    [registry([{ ...base, id: 'Base' }]), 'uppercase id'],
    [registry([base, base]), 'duplicate id'],
    [registry([{ ...base, requires: ['ghost'] }]), 'unknown dependency'],
    [registry([{ ...base, paths: ['../outside/**'] }]), 'escaping path'],
    [registry([]), 'no modules'],
    [{ ...registry([base]), schemaVersion: 1 }, 'wrong schema version'],
  ])('rejects %#: %s', (value) => {
    expect(() => parseRegistry(value, 'test')).toThrow(CliError);
  });

  it('names the offending field in the error', () => {
    expect(() => parseRegistry(registry([{ ...base, version: 42 }]), 'test')).toThrow(/version/);
  });
});

describe('getModule', () => {
  it('throws a helpful error for an unknown id', () => {
    const parsed = parseRegistry(registry([base]), 'test');
    expect(() => getModule(parsed, 'nope')).toThrow(/Unknown module "nope"/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/registry/load.test.ts`
Expected: FAIL — cannot resolve `../../src/registry/schema`.

- [ ] **Step 3: Write `src/registry/schema.ts`**

```ts
import { z } from 'zod';
import { CliError } from '../errors';
import { assertRelativePath } from '../util/paths';

export const MODULE_ID_PATTERN = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9]+)?$/;

const moduleIdSchema = z
  .string()
  .regex(MODULE_ID_PATTERN, 'must be lowercase letters, numbers, and hyphens');

const kitPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        assertRelativePath(value.replaceAll('*', 'x'), 'path');
        return true;
      } catch {
        return false;
      }
    },
    { message: 'must be a relative path that stays inside the kit' },
  );

const moduleSchema = z.object({
  id: moduleIdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  paths: z.array(kitPathSchema).min(1),
  requires: z.array(moduleIdSchema).default([]),
  conflicts: z.array(moduleIdSchema).default([]),
  structured: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  env: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

const registrySchema = z.object({
  schemaVersion: z.literal(2),
  version: z.string().min(1),
  kit: z.object({ template: z.string().min(1), revision: z.string().min(1) }),
  modules: z.array(moduleSchema).min(1),
});

export type RegistryModule = z.infer<typeof moduleSchema>;
export type Registry = z.infer<typeof registrySchema>;

export function parseRegistry(value: unknown, sourceLabel: string): Registry {
  const result = registrySchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const path = issue.path.join('.') || '(root)';
    throw new CliError(`Invalid registry at ${sourceLabel}: ${path} ${issue.message}`);
  }

  const registry = result.data;
  const ids = new Set<string>();
  for (const module of registry.modules) {
    if (ids.has(module.id)) {
      throw new CliError(
        `Invalid registry at ${sourceLabel}: module "${module.id}" is declared more than once.`,
      );
    }
    ids.add(module.id);
  }
  for (const module of registry.modules) {
    for (const id of [...module.requires, ...module.conflicts]) {
      if (!ids.has(id)) {
        throw new CliError(
          `Invalid registry at ${sourceLabel}: module "${module.id}" references unknown module "${id}".`,
        );
      }
    }
  }
  return registry;
}

export function getModule(registry: Registry, id: string): RegistryModule {
  const module = registry.modules.find((candidate) => candidate.id === id);
  if (!module) {
    throw new CliError(
      `Unknown module "${id}". Run "nuxt-starter status" to see available modules.`,
    );
  }
  return module;
}
```

- [ ] **Step 4: Write `src/registry/load.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from '../errors';
import { parseRegistry, type Registry } from './schema';

const bundledRegistryPath = fileURLToPath(new URL('../registry/registry.json', import.meta.url));

export async function loadRegistry(registryPath: string = bundledRegistryPath): Promise<Registry> {
  const absolutePath = resolve(registryPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolutePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to read registry at ${absolutePath}: ${message}`);
  }
  return parseRegistry(parsed, absolutePath);
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run test/registry/load.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/create-nuxt-starter/src/registry packages/create-nuxt-starter/test/registry
git commit -m "feat(cli): add registry v2 schema and loader"
```

---

### Task 5: Module resolution

Turns a user's picks into the full install set: dependencies pulled in transitively, cycles and conflicts rejected, order deterministic (dependencies before dependents).

**Files:**

- Create: `packages/create-nuxt-starter/src/registry/resolve.ts`
- Create: `packages/create-nuxt-starter/test/registry/resolve.test.ts`

**Interfaces:**

- Consumes: `Registry`, `RegistryModule`, `getModule`.
- Produces: `resolveModules(registry: Registry, requestedIds: string[]): RegistryModule[]` — dependency-ordered, deduplicated.

- [ ] **Step 1: Write the failing test**

```ts
// test/registry/resolve.test.ts
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { resolveModules } from '../../src/registry/resolve';
import { parseRegistry, type Registry } from '../../src/registry/schema';

function makeRegistry(modules: Array<Record<string, unknown>>): Registry {
  return parseRegistry(
    {
      schemaVersion: 2,
      version: '1.0.0',
      kit: { template: 'github:acme/kit', revision: 'abc1234' },
      modules: modules.map((module) => ({
        title: 'T',
        description: 'D',
        version: '1.0.0',
        paths: ['x.ts'],
        ...module,
      })),
    },
    'test',
  );
}

describe('resolveModules', () => {
  it('pulls in transitive dependencies, dependencies first', () => {
    const registry = makeRegistry([
      { id: 'base' },
      { id: 'database', requires: ['base'] },
      { id: 'auth', requires: ['database'] },
      { id: 'admin-users', requires: ['auth'] },
    ]);
    expect(resolveModules(registry, ['admin-users']).map((module) => module.id)).toEqual([
      'base',
      'database',
      'auth',
      'admin-users',
    ]);
  });

  it('deduplicates shared dependencies', () => {
    const registry = makeRegistry([
      { id: 'base' },
      { id: 'content', requires: ['base'] },
      { id: 'pwa', requires: ['base'] },
    ]);
    expect(resolveModules(registry, ['content', 'pwa']).map((module) => module.id)).toEqual([
      'base',
      'content',
      'pwa',
    ]);
  });

  it('rejects dependency cycles', () => {
    const registry = makeRegistry([
      { id: 'one', requires: ['two'] },
      { id: 'two', requires: ['one'] },
    ]);
    expect(() => resolveModules(registry, ['one'])).toThrow(/cycle/i);
  });

  it('rejects conflicting modules', () => {
    const registry = makeRegistry([
      { id: 'base' },
      { id: 'sqlite', requires: ['base'], conflicts: ['postgres'] },
      { id: 'postgres', requires: ['base'] },
    ]);
    expect(() => resolveModules(registry, ['sqlite', 'postgres'])).toThrow(
      /cannot be installed together/,
    );
  });

  it('requires at least one module', () => {
    expect(() => resolveModules(makeRegistry([{ id: 'base' }]), [])).toThrow(CliError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/registry/resolve.test.ts`
Expected: FAIL — cannot resolve `../../src/registry/resolve`.

- [ ] **Step 3: Write `src/registry/resolve.ts`**

```ts
import { CliError } from '../errors';
import { getModule, type Registry, type RegistryModule } from './schema';

export function resolveModules(registry: Registry, requestedIds: string[]): RegistryModule[] {
  if (requestedIds.length === 0) {
    throw new CliError('Choose at least one module.');
  }

  const resolved: RegistryModule[] = [];
  const settled = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (settled.has(id)) return;
    if (visiting.has(id)) {
      throw new CliError(`Module dependencies contain a cycle at "${id}".`);
    }
    visiting.add(id);
    const module = getModule(registry, id);
    for (const requiredId of module.requires) visit(requiredId);
    visiting.delete(id);
    settled.add(id);
    resolved.push(module);
  }

  for (const id of requestedIds) visit(id);

  for (const module of resolved) {
    const conflict = module.conflicts.find((id) => settled.has(id));
    if (conflict) {
      throw new CliError(`Modules "${module.id}" and "${conflict}" cannot be installed together.`);
    }
  }

  return resolved;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/registry/resolve.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/registry/resolve.ts packages/create-nuxt-starter/test/registry/resolve.test.ts
git commit -m "feat(cli): resolve module dependencies and conflicts"
```

---

### Task 6: Marker parser

Markers are matched by token, not by comment syntax — one regex handles `//`, `<!-- -->`, and `/* */` authoring styles. Damage (unclosed, unopened, nested, mismatched) is a hard error with a line number, because silently mis-slicing a config file is worse than refusing.

**Files:**

- Create: `packages/create-nuxt-starter/src/markers/parse.ts`
- Create: `packages/create-nuxt-starter/test/markers/parse.test.ts`

**Interfaces:**

- Produces:
  - `type MarkerBlock = { moduleId: string; startLine: number; endLine: number }` — 0-indexed, inclusive of both marker lines.
  - `parseMarkers(contents: string, label: string): MarkerBlock[]`

- [ ] **Step 1: Write the failing test**

```ts
// test/markers/parse.test.ts
import { describe, expect, it } from 'vitest';
import { parseMarkers } from '../../src/markers/parse';

describe('parseMarkers', () => {
  it('finds a block regardless of comment syntax', () => {
    const contents = [
      'export default {',
      '  // <nsk:content>',
      '  content: {},',
      '  // </nsk:content>',
      '}',
    ].join('\n');
    expect(parseMarkers(contents, 'nuxt.config.ts')).toEqual([
      { moduleId: 'content', startLine: 1, endLine: 3 },
    ]);
  });

  it.each([
    ['html', '<!-- <nsk:pwa> -->\n<meta />\n<!-- </nsk:pwa> -->'],
    ['css', '/* <nsk:pwa> */\n.a {}\n/* </nsk:pwa> */'],
  ])('handles %s comment style', (_style, contents) => {
    expect(parseMarkers(contents, 'file')).toEqual([{ moduleId: 'pwa', startLine: 0, endLine: 2 }]);
  });

  it('finds multiple sibling blocks', () => {
    const contents = [
      '// <nsk:auth>',
      'a',
      '// </nsk:auth>',
      '// <nsk:pwa>',
      'p',
      '// </nsk:pwa>',
    ].join('\n');
    expect(parseMarkers(contents, 'file')).toEqual([
      { moduleId: 'auth', startLine: 0, endLine: 2 },
      { moduleId: 'pwa', startLine: 3, endLine: 5 },
    ]);
  });

  it('returns an empty list when there are no markers', () => {
    expect(parseMarkers('const a = 1\n', 'file')).toEqual([]);
  });

  it.each([
    ['unclosed block', '// <nsk:auth>\nconst a = 1\n', /never closed/],
    ['close without open', 'const a = 1\n// </nsk:auth>\n', /closes .* never opened/],
    ['mismatched close', '// <nsk:auth>\na\n// </nsk:pwa>\n', /closes "pwa" .* "auth" is open/],
    [
      'nested block',
      '// <nsk:auth>\n// <nsk:pwa>\np\n// </nsk:pwa>\n// </nsk:auth>\n',
      /cannot be nested/,
    ],
  ])('rejects %s', (_name, contents, pattern) => {
    expect(() => parseMarkers(contents, 'nuxt.config.ts')).toThrow(pattern);
  });

  it('reports the file and line number in errors', () => {
    expect(() => parseMarkers('a\n// <nsk:auth>\n', 'nuxt.config.ts')).toThrow(
      /nuxt\.config\.ts:2/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/markers/parse.test.ts`
Expected: FAIL — cannot resolve `../../src/markers/parse`.

- [ ] **Step 3: Write `src/markers/parse.ts`**

```ts
import { CliError } from '../errors';

const MARKER_PATTERN = /<(\/?)nsk:([a-z0-9]+(?:[a-z0-9-]*[a-z0-9]+)?)>/;

export interface MarkerBlock {
  moduleId: string;
  /** 0-indexed line holding the opening marker. */
  startLine: number;
  /** 0-indexed line holding the closing marker. */
  endLine: number;
}

export function parseMarkers(contents: string, label: string): MarkerBlock[] {
  const blocks: MarkerBlock[] = [];
  let open: { moduleId: string; startLine: number } | null = null;

  contents.split('\n').forEach((line, index) => {
    const match = MARKER_PATTERN.exec(line);
    if (!match) return;

    const isClosing = match[1] === '/';
    const moduleId = match[2]!;
    const location = `${label}:${index + 1}`;

    if (!isClosing) {
      if (open) {
        throw new CliError(
          `Marker blocks cannot be nested: "${moduleId}" opens inside "${open.moduleId}" at ${location}.`,
        );
      }
      open = { moduleId, startLine: index };
      return;
    }

    if (!open) {
      throw new CliError(`Marker at ${location} closes "${moduleId}", which was never opened.`);
    }
    if (open.moduleId !== moduleId) {
      throw new CliError(
        `Marker at ${location} closes "${moduleId}", but "${open.moduleId}" is open.`,
      );
    }
    blocks.push({ moduleId, startLine: open.startLine, endLine: index });
    open = null;
  });

  if (open) {
    const unclosed: { moduleId: string; startLine: number } = open;
    throw new CliError(
      `Marker block "${unclosed.moduleId}" opened at ${label}:${unclosed.startLine + 1} is never closed.`,
    );
  }

  return blocks;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/markers/parse.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/markers packages/create-nuxt-starter/test/markers
git commit -m "feat(cli): parse module marker blocks"
```

---

### Task 7: Marker stripping

Deletes whole lines, opening to closing marker inclusive, for modules that are not installed. Selected modules' blocks are left byte-identical with their markers intact — generated projects retain markers so `add`/`remove` stay mechanical, per the spec.

**Files:**

- Create: `packages/create-nuxt-starter/src/markers/strip.ts`
- Create: `packages/create-nuxt-starter/test/markers/strip.test.ts`

**Interfaces:**

- Consumes: `parseMarkers`, `MarkerBlock`.
- Produces: `stripUnselectedBlocks(contents: string, selectedIds: ReadonlySet<string>, label: string): string` — removes blocks whose module is not selected; leaves selected blocks byte-identical, markers included.

- [ ] **Step 1: Write the failing test**

```ts
// test/markers/strip.test.ts
import { describe, expect, it } from 'vitest';
import { stripUnselectedBlocks } from '../../src/markers/strip';

const config = [
  'export default defineNuxtConfig({',
  '  modules: [',
  '    // <nsk:content>',
  "    '@nuxt/content',",
  '    // </nsk:content>',
  '    // <nsk:pwa>',
  "    '@vite-pwa/nuxt',",
  '    // </nsk:pwa>',
  '  ],',
  '})',
  '',
].join('\n');

describe('stripUnselectedBlocks', () => {
  it('removes unselected blocks entirely, markers included', () => {
    const result = stripUnselectedBlocks(config, new Set(['content']), 'nuxt.config.ts');
    expect(result).toBe(
      [
        'export default defineNuxtConfig({',
        '  modules: [',
        '    // <nsk:content>',
        "    '@nuxt/content',",
        '    // </nsk:content>',
        '  ],',
        '})',
        '',
      ].join('\n'),
    );
  });

  it('keeps selected blocks byte-identical, markers retained', () => {
    expect(stripUnselectedBlocks(config, new Set(['content', 'pwa']), 'nuxt.config.ts')).toBe(
      config,
    );
  });

  it('removes every block when nothing is selected', () => {
    expect(stripUnselectedBlocks(config, new Set(), 'nuxt.config.ts')).toBe(
      ['export default defineNuxtConfig({', '  modules: [', '  ],', '})', ''].join('\n'),
    );
  });

  it('leaves marker-free content untouched', () => {
    const plain = 'const a = 1\nconst b = 2\n';
    expect(stripUnselectedBlocks(plain, new Set(['base']), 'file.ts')).toBe(plain);
  });

  it('preserves CRLF-free trailing newline handling', () => {
    const contents = '// <nsk:pwa>\nx\n// </nsk:pwa>\nkeep\n';
    expect(stripUnselectedBlocks(contents, new Set(), 'file.ts')).toBe('keep\n');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/markers/strip.test.ts`
Expected: FAIL — cannot resolve `../../src/markers/strip`.

- [ ] **Step 3: Write `src/markers/strip.ts`**

```ts
import { parseMarkers } from './parse';

export function stripUnselectedBlocks(
  contents: string,
  selectedIds: ReadonlySet<string>,
  label: string,
): string {
  const blocks = parseMarkers(contents, label);
  const removable = blocks.filter((block) => !selectedIds.has(block.moduleId));
  if (removable.length === 0) return contents;

  const removedLines = new Set<number>();
  for (const block of removable) {
    for (let line = block.startLine; line <= block.endLine; line += 1) {
      removedLines.add(line);
    }
  }

  return contents
    .split('\n')
    .filter((_line, index) => !removedLines.has(index))
    .join('\n');
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/markers/strip.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/markers/strip.ts packages/create-nuxt-starter/test/markers/strip.test.ts
git commit -m "feat(cli): strip unselected marker blocks"
```

---

### Task 8: Placeholder substitution

Literal token replacement only. Anything cleverer (regex rewriting, "sanitization") would make an old render irreproducible and break Plan 2's three-way merges.

**Files:**

- Create: `packages/create-nuxt-starter/src/render/placeholders.ts`
- Create: `packages/create-nuxt-starter/test/render/placeholders.test.ts`

**Interfaces:**

- Produces:
  - `type Placeholders = Record<string, string>`
  - `PLACEHOLDER_KEYS: readonly ['PROJECT_NAME', 'PROJECT_DESCRIPTION', 'AUTHOR_NAME', 'AUTHOR_EMAIL']`
  - `applyPlaceholders(contents: string, placeholders: Placeholders): string`
  - `assertKnownPlaceholders(placeholders: Placeholders): void` — throws `CliError` on unknown keys.

- [ ] **Step 1: Write the failing test**

```ts
// test/render/placeholders.test.ts
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { applyPlaceholders, assertKnownPlaceholders } from '../../src/render/placeholders';

describe('applyPlaceholders', () => {
  it('replaces every occurrence of a token', () => {
    const contents = '{"name":"{{PROJECT_NAME}}","bin":"{{PROJECT_NAME}}"}';
    expect(applyPlaceholders(contents, { PROJECT_NAME: 'my-app' })).toBe(
      '{"name":"my-app","bin":"my-app"}',
    );
  });

  it('leaves unrelated content untouched', () => {
    expect(applyPlaceholders('const a = `${b}`\n', { PROJECT_NAME: 'x' })).toBe(
      'const a = `${b}`\n',
    );
  });

  it('does not re-expand substituted values', () => {
    expect(
      applyPlaceholders('{{PROJECT_NAME}}', {
        PROJECT_NAME: '{{AUTHOR_NAME}}',
        AUTHOR_NAME: 'nope',
      }),
    ).toBe('{{AUTHOR_NAME}}');
  });

  it('leaves tokens with no supplied value in place', () => {
    expect(applyPlaceholders('{{AUTHOR_EMAIL}}', { PROJECT_NAME: 'x' })).toBe('{{AUTHOR_EMAIL}}');
  });
});

describe('assertKnownPlaceholders', () => {
  it('accepts known keys', () => {
    expect(() =>
      assertKnownPlaceholders({ PROJECT_NAME: 'x', AUTHOR_EMAIL: 'a@b.c' }),
    ).not.toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() => assertKnownPlaceholders({ NOT_A_KEY: 'x' })).toThrow(CliError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/render/placeholders.test.ts`
Expected: FAIL — cannot resolve `../../src/render/placeholders`.

- [ ] **Step 3: Write `src/render/placeholders.ts`**

```ts
import { CliError } from '../errors';

export const PLACEHOLDER_KEYS = [
  'PROJECT_NAME',
  'PROJECT_DESCRIPTION',
  'AUTHOR_NAME',
  'AUTHOR_EMAIL',
] as const;

export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number];
export type Placeholders = Record<string, string>;

export function assertKnownPlaceholders(placeholders: Placeholders): void {
  const known = new Set<string>(PLACEHOLDER_KEYS);
  for (const key of Object.keys(placeholders)) {
    if (!known.has(key)) {
      throw new CliError(
        `Unknown placeholder "${key}". Known placeholders: ${PLACEHOLDER_KEYS.join(', ')}.`,
      );
    }
  }
}

/**
 * Replaces `{{TOKEN}}` with its value in a single pass, so substituted values
 * are never themselves expanded. Rendering must stay reproducible: an old
 * revision rendered today has to match what an older CLI produced.
 */
export function applyPlaceholders(contents: string, placeholders: Placeholders): string {
  return contents.replaceAll(/\{\{([A-Z0-9_]+)\}\}/g, (token, key: string) =>
    Object.hasOwn(placeholders, key) ? placeholders[key]! : token,
  );
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/render/placeholders.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/render packages/create-nuxt-starter/test/render
git commit -m "feat(cli): substitute literal placeholder tokens"
```

---

### Task 9: The fixture kit

A miniature kit repo used by every render and (in Plan 2) upgrade test. Hermetic and fast — real starter-kit history is far too slow to test against.

**Files:**

- Create: `packages/create-nuxt-starter/test/fixtures/kit-v1/` (kit source tree)
- Create: `packages/create-nuxt-starter/test/fixtures/kit-v1/registry.json`
- Create: `packages/create-nuxt-starter/test/support/fixtureKit.ts`
- Create: `packages/create-nuxt-starter/test/support/fixtureKit.test.ts`

**Interfaces:**

- Produces:
  - `FIXTURE_KIT_V1_ROOT: string` — absolute path to the fixture kit tree.
  - `loadFixtureRegistry(): Promise<Registry>` — parses the fixture registry.
  - `makeTempDir(prefix: string): Promise<string>` — temp directory helper for tests.

- [ ] **Step 1: Create the fixture kit tree**

Files, with exact contents:

`test/fixtures/kit-v1/nuxt.config.ts` — shared file owned by `base`, carrying other modules' blocks:

```ts
export default defineNuxtConfig({
  modules: [
    // <nsk:content>
    '@nuxt/content',
    // </nsk:content>
    // <nsk:pwa>
    '@vite-pwa/nuxt',
    // </nsk:pwa>
  ],
});
```

`test/fixtures/kit-v1/package.json`:

```json
{
  "name": "{{PROJECT_NAME}}",
  "description": "{{PROJECT_DESCRIPTION}}",
  "private": true,
  "type": "module"
}
```

`test/fixtures/kit-v1/app/app.vue`:

```vue
<template>
  <div>{{ '{{PROJECT_NAME}}' }}</div>
</template>
```

`test/fixtures/kit-v1/app/pages/index.vue`:

```vue
<template>
  <h1>Home</h1>
</template>
```

`test/fixtures/kit-v1/content.config.ts` (owned by `content`):

```ts
export default defineContentConfig({
  collections: {},
});
```

`test/fixtures/kit-v1/app/components/InstallPrompter.vue` (owned by `pwa`):

```vue
<template>
  <button>Install</button>
</template>
```

- [ ] **Step 2: Create `test/fixtures/kit-v1/registry.json`**

```json
{
  "schemaVersion": 2,
  "version": "1.0.0",
  "kit": { "template": "fixture", "revision": "v1" },
  "modules": [
    {
      "id": "base",
      "title": "Base",
      "description": "Nuxt foundation",
      "version": "1.0.0",
      "paths": ["nuxt.config.ts", "package.json", "app/app.vue", "app/pages/**"]
    },
    {
      "id": "content",
      "title": "Content",
      "description": "Nuxt Content",
      "version": "1.0.0",
      "requires": ["base"],
      "paths": ["content.config.ts"],
      "structured": { "package.json": { "dependencies": { "@nuxt/content": "^3.0.0" } } }
    },
    {
      "id": "pwa",
      "title": "PWA",
      "description": "Installable app",
      "version": "1.0.0",
      "requires": ["base"],
      "paths": ["app/components/InstallPrompter.vue"],
      "structured": { "package.json": { "dependencies": { "@vite-pwa/nuxt": "^1.0.0" } } },
      "notes": ["Generate PWA icons before deploying."]
    }
  ]
}
```

- [ ] **Step 3: Write the failing test**

```ts
// test/support/fixtureKit.test.ts
import { describe, expect, it } from 'vitest';
import { listFiles } from '../../src/util/fs';
import { FIXTURE_KIT_V1_ROOT, loadFixtureRegistry, makeTempDir } from './fixtureKit';

describe('fixture kit', () => {
  it('contains the expected source tree', async () => {
    expect(await listFiles(FIXTURE_KIT_V1_ROOT)).toEqual([
      'app/app.vue',
      'app/components/InstallPrompter.vue',
      'app/pages/index.vue',
      'content.config.ts',
      'nuxt.config.ts',
      'package.json',
      'registry.json',
    ]);
  });

  it('parses its registry', async () => {
    const registry = await loadFixtureRegistry();
    expect(registry.modules.map((module) => module.id)).toEqual(['base', 'content', 'pwa']);
  });

  it('creates isolated temp directories', async () => {
    expect(await makeTempDir('render')).not.toBe(await makeTempDir('render'));
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run test/support/fixtureKit.test.ts`
Expected: FAIL — cannot resolve `./fixtureKit`.

- [ ] **Step 5: Write `test/support/fixtureKit.ts`**

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../../src/registry/load';
import type { Registry } from '../../src/registry/schema';

export const FIXTURE_KIT_V1_ROOT = fileURLToPath(new URL('../fixtures/kit-v1/', import.meta.url));

export function loadFixtureRegistry(): Promise<Registry> {
  return loadRegistry(join(FIXTURE_KIT_V1_ROOT, 'registry.json'));
}

export function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `nsk-${prefix}-`));
}
```

- [ ] **Step 6: Verify tests pass**

Run: `npx vitest run test/support/fixtureKit.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/create-nuxt-starter/test/fixtures packages/create-nuxt-starter/test/support
git commit -m "test(cli): add miniature fixture kit"
```

---

### Task 10: The renderer

The heart of Plan 1, and the contract Plan 2's merge engine depends on: given a kit tree, a module set, and placeholders, produce the exact file tree that belongs in a project. `registry.json` inside a kit tree is never rendered — it describes the kit, it is not part of it.

**Files:**

- Create: `packages/create-nuxt-starter/src/render/render.ts`
- Create: `packages/create-nuxt-starter/test/render/render.test.ts`

**Interfaces:**

- Consumes: `RegistryModule`, `stripUnselectedBlocks`, `applyPlaceholders`, `listFiles`, `readTextFile`, `writeTextFile`, `hashContent`, `resolveInside`.
- Produces:
  - `type RenderedFile = { path: string; moduleId: string; hash: string }`
  - `renderKit(options: { kitRoot: string; modules: RegistryModule[]; placeholders: Placeholders; destinationRoot: string }): Promise<RenderedFile[]>` — returns files sorted by path.

- [ ] **Step 1: Write the failing test**

```ts
// test/render/render.test.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveModules } from '../../src/registry/resolve';
import { renderKit } from '../../src/render/render';
import { listFiles } from '../../src/util/fs';
import { FIXTURE_KIT_V1_ROOT, loadFixtureRegistry, makeTempDir } from '../support/fixtureKit';

async function render(ids: string[]) {
  const registry = await loadFixtureRegistry();
  const destinationRoot = await makeTempDir('render');
  const files = await renderKit({
    kitRoot: FIXTURE_KIT_V1_ROOT,
    modules: resolveModules(registry, ids),
    placeholders: { PROJECT_NAME: 'my-app', PROJECT_DESCRIPTION: 'A test app' },
    destinationRoot,
  });
  return { destinationRoot, files };
}

describe('renderKit', () => {
  it("emits only the selected modules' files and never the registry", async () => {
    const { destinationRoot } = await render(['base']);
    expect(await listFiles(destinationRoot)).toEqual([
      'app/app.vue',
      'app/pages/index.vue',
      'nuxt.config.ts',
      'package.json',
    ]);
  });

  it('adds files owned by additional modules', async () => {
    const { destinationRoot } = await render(['content']);
    expect(await listFiles(destinationRoot)).toContain('content.config.ts');
  });

  it('strips unselected marker blocks from shared files', async () => {
    const { destinationRoot } = await render(['content']);
    const config = await readFile(join(destinationRoot, 'nuxt.config.ts'), 'utf8');
    expect(config).toContain("'@nuxt/content'");
    expect(config).not.toContain('@vite-pwa/nuxt');
    expect(config).toContain('// <nsk:content>');
  });

  it('substitutes placeholders', async () => {
    const { destinationRoot } = await render(['base']);
    const packageJson = JSON.parse(await readFile(join(destinationRoot, 'package.json'), 'utf8'));
    expect(packageJson.name).toBe('my-app');
    expect(packageJson.description).toBe('A test app');
  });

  it('attributes each file to its owning module and hashes it', async () => {
    const { files } = await render(['content']);
    const contentConfig = files.find((file) => file.path === 'content.config.ts');
    expect(contentConfig?.moduleId).toBe('content');
    expect(contentConfig?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(files.find((file) => file.path === 'nuxt.config.ts')?.moduleId).toBe('base');
  });

  it('is deterministic — the same inputs produce the same hashes', async () => {
    const first = await render(['content', 'pwa']);
    const second = await render(['content', 'pwa']);
    expect(first.files).toEqual(second.files);
  });

  it('rejects a module whose declared path matches nothing', async () => {
    const registry = await loadFixtureRegistry();
    const modules = resolveModules(registry, ['base']).map((module) =>
      module.id === 'base' ? { ...module, paths: [...module.paths, 'does/not/exist.ts'] } : module,
    );
    await expect(
      renderKit({
        kitRoot: FIXTURE_KIT_V1_ROOT,
        modules,
        placeholders: {},
        destinationRoot: await makeTempDir('render'),
      }),
    ).rejects.toThrow(/does\/not\/exist\.ts/);
  });

  it('rejects two modules claiming the same file', async () => {
    const registry = await loadFixtureRegistry();
    const modules = resolveModules(registry, ['content']).map((module) =>
      module.id === 'content' ? { ...module, paths: [...module.paths, 'nuxt.config.ts'] } : module,
    );
    await expect(
      renderKit({
        kitRoot: FIXTURE_KIT_V1_ROOT,
        modules,
        placeholders: {},
        destinationRoot: await makeTempDir('render'),
      }),
    ).rejects.toThrow(/claimed by both/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/render/render.test.ts`
Expected: FAIL — cannot resolve `../../src/render/render`.

- [ ] **Step 3: Write `src/render/render.ts`**

```ts
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { glob } from 'tinyglobby';
import { CliError } from '../errors';
import { stripUnselectedBlocks } from '../markers/strip';
import type { RegistryModule } from '../registry/schema';
import { hashContent, readTextFile, writeTextFile } from '../util/fs';
import { resolveInside } from '../util/paths';
import { applyPlaceholders, assertKnownPlaceholders, type Placeholders } from './placeholders';

/** Kit metadata that describes the kit but is never part of a generated project. */
const NEVER_RENDERED = new Set(['registry.json']);

export interface RenderedFile {
  path: string;
  moduleId: string;
  hash: string;
}

export interface RenderOptions {
  kitRoot: string;
  modules: RegistryModule[];
  placeholders: Placeholders;
  destinationRoot: string;
}

async function resolveOwnership(
  kitRoot: string,
  modules: RegistryModule[],
): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  for (const module of modules) {
    for (const pattern of module.paths) {
      const matches = await glob(pattern, {
        cwd: kitRoot,
        dot: true,
        onlyFiles: true,
        followSymbolicLinks: false,
      });
      if (matches.length === 0) {
        throw new CliError(
          `Module "${module.id}" declares path "${pattern}", which matches no file in the kit.`,
        );
      }
      for (const match of matches) {
        if (NEVER_RENDERED.has(match)) continue;
        const existingOwner = owners.get(match);
        if (existingOwner && existingOwner !== module.id) {
          throw new CliError(
            `File "${match}" is claimed by both "${existingOwner}" and "${module.id}".`,
          );
        }
        owners.set(match, module.id);
      }
    }
  }
  return owners;
}

export async function renderKit(options: RenderOptions): Promise<RenderedFile[]> {
  const { kitRoot, modules, placeholders, destinationRoot } = options;
  assertKnownPlaceholders(placeholders);

  const selectedIds = new Set(modules.map((module) => module.id));
  const owners = await resolveOwnership(kitRoot, modules);
  const rendered: RenderedFile[] = [];

  for (const path of [...owners.keys()].sort()) {
    const moduleId = owners.get(path)!;
    const source = resolveInside(kitRoot, path, 'Kit file');
    const destination = resolveInside(destinationRoot, path, 'Generated file');
    await mkdir(dirname(destination), { recursive: true });

    const contents = await readTextFile(source);
    if (contents === null) {
      await copyFile(source, destination);
      rendered.push({ path, moduleId, hash: hashContent((await readTextFile(destination)) ?? '') });
      continue;
    }

    const stripped = stripUnselectedBlocks(contents, selectedIds, path);
    const substituted = applyPlaceholders(stripped, placeholders);
    await writeTextFile(destination, substituted);
    rendered.push({ path, moduleId, hash: hashContent(substituted) });
  }

  return rendered;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/render/render.test.ts`
Expected: the binary-file branch hashes wrongly (it re-reads a binary as text and yields `''`). Fix it before moving on — replace the binary branch body with:

```ts
if (contents === null) {
  const raw = await readFile(source);
  await writeFile(destination, raw);
  rendered.push({ path, moduleId, hash: hashContent(raw) });
  continue;
}
```

and add `import { readFile, writeFile } from 'node:fs/promises';` (dropping `copyFile`).

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run test/render/render.test.ts && npm run typecheck`
Expected: PASS (8 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/create-nuxt-starter/src/render/render.ts packages/create-nuxt-starter/test/render/render.test.ts
git commit -m "feat(cli): render a module selection from a kit tree"
```

---

### Task 11: Project manifest

Written into every generated project. Plan 2 reads it to know which revision to diff against; a hand-corrupted manifest must fail with a readable message rather than crashing mid-upgrade.

**Files:**

- Create: `packages/create-nuxt-starter/src/manifest/schema.ts`
- Create: `packages/create-nuxt-starter/src/manifest/io.ts`
- Create: `packages/create-nuxt-starter/test/manifest/io.test.ts`

**Interfaces:**

- Consumes: `writeJsonAtomically`, `pathExists`, `CliError`, `RenderedFile`.
- Produces:
  - `MANIFEST_PATH = '.nuxt-starter/manifest.json'`, `MANIFEST_SCHEMA_VERSION = 1`, `RENDER_VERSION = 1`
  - `type ManifestModule = { id: string; version: string; files: Record<string, string>; orphaned: string[] }`
  - `type ProjectManifest = { schemaVersion: 1; renderVersion: number; kit: { template: string; revision: string }; placeholders: Record<string, string>; modules: ManifestModule[] }`
  - `buildManifest(options: { kit; placeholders; modules: RegistryModule[]; rendered: RenderedFile[] }): ProjectManifest`
  - `readManifest(projectRoot: string): Promise<ProjectManifest>` — throws `CliError` when absent or invalid.
  - `writeManifest(projectRoot: string, manifest: ProjectManifest): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// test/manifest/io.test.ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { buildManifest, MANIFEST_PATH, readManifest, writeManifest } from '../../src/manifest/io';
import { resolveModules } from '../../src/registry/resolve';
import { writeJsonAtomically, writeTextFile } from '../../src/util/fs';
import { loadFixtureRegistry, makeTempDir } from '../support/fixtureKit';

async function sampleManifest() {
  const registry = await loadFixtureRegistry();
  const modules = resolveModules(registry, ['content']);
  return buildManifest({
    kit: registry.kit,
    placeholders: { PROJECT_NAME: 'my-app' },
    modules,
    rendered: [
      { path: 'nuxt.config.ts', moduleId: 'base', hash: 'sha256:aaa' },
      { path: 'content.config.ts', moduleId: 'content', hash: 'sha256:bbb' },
    ],
  });
}

describe('buildManifest', () => {
  it('groups rendered files under their owning module', async () => {
    const manifest = await sampleManifest();
    expect(manifest.modules.map((module) => module.id)).toEqual(['base', 'content']);
    expect(manifest.modules[0]!.files).toEqual({ 'nuxt.config.ts': 'sha256:aaa' });
    expect(manifest.modules[1]!.files).toEqual({ 'content.config.ts': 'sha256:bbb' });
    expect(manifest.modules[0]!.orphaned).toEqual([]);
  });

  it('records the kit revision, placeholders, and versions', async () => {
    const manifest = await sampleManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.renderVersion).toBe(1);
    expect(manifest.kit.revision).toBe('v1');
    expect(manifest.placeholders).toEqual({ PROJECT_NAME: 'my-app' });
  });
});

describe('readManifest / writeManifest', () => {
  it('round-trips through disk', async () => {
    const projectRoot = await makeTempDir('manifest');
    const manifest = await sampleManifest();
    await writeManifest(projectRoot, manifest);
    expect(await readManifest(projectRoot)).toEqual(manifest);
  });

  it('explains that a directory is not a starter project', async () => {
    const projectRoot = await makeTempDir('manifest');
    await expect(readManifest(projectRoot)).rejects.toThrow(/not a Nuxt Starter Kit project/);
  });

  it('rejects a corrupted manifest with a readable error', async () => {
    const projectRoot = await makeTempDir('manifest');
    await writeJsonAtomically(join(projectRoot, MANIFEST_PATH), {
      schemaVersion: 1,
      modules: 'nope',
    });
    await expect(readManifest(projectRoot)).rejects.toThrow(CliError);
  });

  it('rejects unparseable JSON', async () => {
    const projectRoot = await makeTempDir('manifest');
    await writeTextFile(join(projectRoot, MANIFEST_PATH), '{ not json');
    await expect(readManifest(projectRoot)).rejects.toThrow(/Unable to read/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/manifest/io.test.ts`
Expected: FAIL — cannot resolve `../../src/manifest/io`.

- [ ] **Step 3: Write `src/manifest/schema.ts`**

```ts
import { z } from 'zod';
import { CliError } from '../errors';

export const MANIFEST_SCHEMA_VERSION = 1;
/** Bumped only when rendering semantics change; upgrades warn on a mismatch. */
export const RENDER_VERSION = 1;

const manifestModuleSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  files: z.record(z.string(), z.string()),
  orphaned: z.array(z.string()).default([]),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  renderVersion: z.number().int().positive(),
  kit: z.object({ template: z.string().min(1), revision: z.string().min(1) }),
  placeholders: z.record(z.string(), z.string()),
  modules: z.array(manifestModuleSchema),
});

export type ManifestModule = z.infer<typeof manifestModuleSchema>;
export type ProjectManifest = z.infer<typeof manifestSchema>;

export function parseManifest(value: unknown, sourceLabel: string): ProjectManifest {
  const result = manifestSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const path = issue.path.join('.') || '(root)';
    throw new CliError(`Invalid project manifest at ${sourceLabel}: ${path} ${issue.message}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Write `src/manifest/io.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CliError } from '../errors';
import type { RegistryModule } from '../registry/schema';
import type { RenderedFile } from '../render/render';
import { pathExists, writeJsonAtomically } from '../util/fs';
import {
  MANIFEST_SCHEMA_VERSION,
  parseManifest,
  RENDER_VERSION,
  type ProjectManifest,
} from './schema';

export { MANIFEST_SCHEMA_VERSION, RENDER_VERSION } from './schema';
export type { ManifestModule, ProjectManifest } from './schema';

export const MANIFEST_PATH = '.nuxt-starter/manifest.json';

export interface BuildManifestOptions {
  kit: { template: string; revision: string };
  placeholders: Record<string, string>;
  modules: RegistryModule[];
  rendered: RenderedFile[];
}

export function buildManifest(options: BuildManifestOptions): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    renderVersion: RENDER_VERSION,
    kit: options.kit,
    placeholders: options.placeholders,
    modules: options.modules.map((module) => ({
      id: module.id,
      version: module.version,
      files: Object.fromEntries(
        options.rendered
          .filter((file) => file.moduleId === module.id)
          .map((file) => [file.path, file.hash]),
      ),
      orphaned: [],
    })),
  };
}

export async function readManifest(projectRoot: string): Promise<ProjectManifest> {
  const path = join(projectRoot, MANIFEST_PATH);
  if (!(await pathExists(path))) {
    throw new CliError(`${projectRoot} is not a Nuxt Starter Kit project (no ${MANIFEST_PATH}).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to read ${path}: ${message}`);
  }
  return parseManifest(parsed, path);
}

export async function writeManifest(projectRoot: string, manifest: ProjectManifest): Promise<void> {
  await writeJsonAtomically(join(projectRoot, MANIFEST_PATH), manifest);
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run test/manifest/io.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/create-nuxt-starter/src/manifest packages/create-nuxt-starter/test/manifest
git commit -m "feat(cli): read and write the project manifest"
```

---

### Task 12: Kit sources

Resolves the registry's pinned kit into a local directory: `giget` for git templates, a plain path for local kits (used by tests and `--kit`).

**Files:**

- Create: `packages/create-nuxt-starter/src/sources/fetchKit.ts`
- Create: `packages/create-nuxt-starter/test/sources/fetchKit.test.ts`

**Interfaces:**

- Consumes: `CliError`, `pathExists`.
- Produces: `fetchKit(options: { template: string; revision: string; localKitRoot?: string }): Promise<{ root: string; cleanup: () => Promise<void> }>`

- [ ] **Step 1: Write the failing test**

```ts
// test/sources/fetchKit.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fetchKit } from '../../src/sources/fetchKit';
import { FIXTURE_KIT_V1_ROOT } from '../support/fixtureKit';

vi.mock('giget', () => ({
  downloadTemplate: vi.fn(async (source: string) => ({ dir: `/downloaded/${source}` })),
}));

describe('fetchKit', () => {
  it('uses a local kit root without downloading', async () => {
    const { downloadTemplate } = await import('giget');
    const kit = await fetchKit({
      template: 'fixture',
      revision: 'v1',
      localKitRoot: FIXTURE_KIT_V1_ROOT,
    });
    expect(kit.root).toBe(FIXTURE_KIT_V1_ROOT);
    expect(downloadTemplate).not.toHaveBeenCalled();
    await kit.cleanup();
  });

  it('rejects a local kit root that does not exist', async () => {
    await expect(
      fetchKit({ template: 'fixture', revision: 'v1', localKitRoot: '/no/such/kit' }),
    ).rejects.toThrow(/\/no\/such\/kit/);
  });

  it('downloads the template pinned at the revision', async () => {
    const { downloadTemplate } = await import('giget');
    const kit = await fetchKit({ template: 'github:acme/kit', revision: 'abc1234' });
    expect(downloadTemplate).toHaveBeenCalledWith(
      'github:acme/kit#abc1234',
      expect.objectContaining({ force: true }),
    );
    expect(kit.root).toBe('/downloaded/github:acme/kit#abc1234');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/sources/fetchKit.test.ts`
Expected: FAIL — cannot resolve `../../src/sources/fetchKit`.

- [ ] **Step 3: Write `src/sources/fetchKit.ts`**

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { downloadTemplate } from 'giget';
import { CliError } from '../errors';
import { pathExists } from '../util/fs';

export interface FetchKitOptions {
  template: string;
  revision: string;
  /** Bypasses downloading — used by tests and the `--kit` flag. */
  localKitRoot?: string;
}

export interface FetchedKit {
  root: string;
  cleanup: () => Promise<void>;
}

export async function fetchKit(options: FetchKitOptions): Promise<FetchedKit> {
  if (options.localKitRoot !== undefined) {
    const root = resolve(options.localKitRoot);
    if (!(await pathExists(root))) {
      throw new CliError(`Local kit root ${root} does not exist.`);
    }
    return { root, cleanup: async () => {} };
  }

  const source = `${options.template}#${options.revision}`;
  const directory = await mkdtemp(join(tmpdir(), 'nsk-kit-'));
  try {
    const result = await downloadTemplate(source, { dir: directory, force: true });
    return { root: result.dir, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to fetch kit ${source}: ${message}`);
  }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/sources/fetchKit.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/sources packages/create-nuxt-starter/test/sources
git commit -m "feat(cli): fetch pinned kit revisions"
```

---

### Task 13: `init` command

Composes everything into the user-facing generator. The command function is separated from the prompting so it can be tested without a TTY.

**Files:**

- Create: `packages/create-nuxt-starter/src/commands/init.ts`
- Create: `packages/create-nuxt-starter/test/commands/init.test.ts`

**Interfaces:**

- Consumes: `fetchKit`, `resolveModules`, `renderKit`, `buildManifest`, `writeManifest`, `Registry`, `Placeholders`.
- Produces:
  - `type InitResult = { projectRoot: string; moduleIds: string[]; fileCount: number; notes: string[]; env: string[] }`
  - `runInit(options: { registry: Registry; targetDir: string; moduleIds: string[]; placeholders: Placeholders; localKitRoot?: string }): Promise<InitResult>`

- [ ] **Step 1: Write the failing test**

```ts
// test/commands/init.test.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInit } from '../../src/commands/init';
import { readManifest } from '../../src/manifest/io';
import { listFiles, writeTextFile } from '../../src/util/fs';
import { FIXTURE_KIT_V1_ROOT, loadFixtureRegistry, makeTempDir } from '../support/fixtureKit';

async function init(moduleIds: string[], targetDir?: string) {
  const registry = await loadFixtureRegistry();
  return runInit({
    registry,
    targetDir: targetDir ?? join(await makeTempDir('init'), 'my-app'),
    moduleIds,
    placeholders: { PROJECT_NAME: 'my-app', PROJECT_DESCRIPTION: 'Test' },
    localKitRoot: FIXTURE_KIT_V1_ROOT,
  });
}

describe('runInit', () => {
  it('generates the selected modules plus their dependencies', async () => {
    const result = await init(['pwa']);
    expect(result.moduleIds).toEqual(['base', 'pwa']);
    expect(await listFiles(result.projectRoot)).toEqual([
      '.nuxt-starter/manifest.json',
      'app/app.vue',
      'app/components/InstallPrompter.vue',
      'app/pages/index.vue',
      'nuxt.config.ts',
      'package.json',
    ]);
  });

  it('writes a manifest describing what was installed', async () => {
    const result = await init(['content']);
    const manifest = await readManifest(result.projectRoot);
    expect(manifest.modules.map((module) => module.id)).toEqual(['base', 'content']);
    expect(manifest.kit.revision).toBe('v1');
    expect(manifest.placeholders.PROJECT_NAME).toBe('my-app');
    expect(Object.keys(manifest.modules[1]!.files)).toEqual(['content.config.ts']);
  });

  it('merges structured fragments of installed modules into package.json', async () => {
    const result = await init(['content', 'pwa']);
    const packageJson = JSON.parse(
      await readFile(join(result.projectRoot, 'package.json'), 'utf8'),
    );
    expect(packageJson.dependencies).toEqual({
      '@nuxt/content': '^3.0.0',
      '@vite-pwa/nuxt': '^1.0.0',
    });
    expect(packageJson.name).toBe('my-app');
  });

  it('surfaces module notes', async () => {
    const result = await init(['pwa']);
    expect(result.notes).toContain('Generate PWA icons before deploying.');
  });

  it('refuses to generate into a non-empty directory', async () => {
    const targetDir = await makeTempDir('init-existing');
    await writeTextFile(join(targetDir, 'README.md'), 'mine');
    await expect(init(['base'], targetDir)).rejects.toThrow(/not empty/);
  });

  it('generates into an existing empty directory', async () => {
    const targetDir = await makeTempDir('init-empty');
    const result = await init(['base'], targetDir);
    expect(result.projectRoot).toBe(targetDir);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/commands/init.test.ts`
Expected: FAIL — cannot resolve `../../src/commands/init`.

- [ ] **Step 3: Write `src/commands/init.ts`**

```ts
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CliError } from '../errors';
import { buildManifest, writeManifest } from '../manifest/io';
import type { Registry } from '../registry/schema';
import { resolveModules } from '../registry/resolve';
import { renderKit } from '../render/render';
import type { Placeholders } from '../render/placeholders';
import { fetchKit } from '../sources/fetchKit';
import { pathExists, writeJsonAtomically } from '../util/fs';

export interface InitOptions {
  registry: Registry;
  targetDir: string;
  moduleIds: string[];
  placeholders: Placeholders;
  localKitRoot?: string;
}

export interface InitResult {
  projectRoot: string;
  moduleIds: string[];
  fileCount: number;
  notes: string[];
  env: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merges a module's structured fragment into a parsed JSON document. */
function mergeFragment(target: Record<string, unknown>, fragment: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(fragment)) {
    const existing = target[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      mergeFragment(existing, value);
      continue;
    }
    target[key] = value;
  }
}

async function assertEmptyTarget(projectRoot: string): Promise<void> {
  if (!(await pathExists(projectRoot))) return;
  const entries = await readdir(projectRoot);
  if (entries.length > 0) {
    throw new CliError(`${projectRoot} is not empty. Choose an empty directory.`);
  }
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const projectRoot = resolve(options.targetDir);
  await assertEmptyTarget(projectRoot);

  const modules = resolveModules(options.registry, options.moduleIds);
  const kit = await fetchKit({
    template: options.registry.kit.template,
    revision: options.registry.kit.revision,
    ...(options.localKitRoot === undefined ? {} : { localKitRoot: options.localKitRoot }),
  });

  try {
    await mkdir(projectRoot, { recursive: true });
    const rendered = await renderKit({
      kitRoot: kit.root,
      modules,
      placeholders: options.placeholders,
      destinationRoot: projectRoot,
    });

    for (const [file, fragments] of collectStructured(modules)) {
      const path = join(projectRoot, file);
      if (!(await pathExists(path))) {
        throw new CliError(
          `Module structured data targets "${file}", which no installed module provides.`,
        );
      }
      const document: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!isPlainObject(document)) {
        throw new CliError(`Structured target "${file}" must contain a JSON object.`);
      }
      for (const fragment of fragments) mergeFragment(document, fragment);
      await writeJsonAtomically(path, document);
    }

    const manifest = buildManifest({
      kit: options.registry.kit,
      placeholders: options.placeholders,
      modules,
      rendered,
    });
    await writeManifest(projectRoot, manifest);

    return {
      projectRoot,
      moduleIds: modules.map((module) => module.id),
      fileCount: rendered.length,
      notes: modules.flatMap((module) => module.notes),
      env: [...new Set(modules.flatMap((module) => module.env))],
    };
  } finally {
    await kit.cleanup();
  }
}

function collectStructured(modules: { structured: Record<string, Record<string, unknown>> }[]) {
  const byFile = new Map<string, Record<string, unknown>[]>();
  for (const module of modules) {
    for (const [file, fragment] of Object.entries(module.structured)) {
      byFile.set(file, [...(byFile.get(file) ?? []), fragment]);
    }
  }
  return byFile;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/commands/init.test.ts && npm run typecheck`
Expected: PASS (6 tests), typecheck clean.

Note: structured merging rewrites `package.json` after rendering, so its manifest hash no longer matches the file on disk. Task 14 fixes this by rehashing structured targets; do not "fix" it here.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/commands packages/create-nuxt-starter/test/commands
git commit -m "feat(cli): generate projects with runInit"
```

---

### Task 14: Rehash structured targets

Closes the hole Task 13 left: a file the structured merge rewrote must be hashed **after** the rewrite, or Plan 2 would classify every generated `package.json` as user-modified on the first upgrade.

**Files:**

- Modify: `packages/create-nuxt-starter/src/commands/init.ts`
- Modify: `packages/create-nuxt-starter/test/commands/init.test.ts`

**Interfaces:**

- Produces: no signature change; `InitResult` and `runInit` keep their Task 13 shapes.

- [ ] **Step 1: Write the failing test (append to `test/commands/init.test.ts`)**

```ts
describe('manifest hashes', () => {
  it('records the post-merge hash of structured targets', async () => {
    const result = await init(['content']);
    const manifest = await readManifest(result.projectRoot);
    const recorded = manifest.modules.find((module) => module.id === 'base')!.files['package.json'];
    const onDisk = hashContent(await readFile(join(result.projectRoot, 'package.json'), 'utf8'));
    expect(recorded).toBe(onDisk);
  });

  it('records the render hash of untouched files', async () => {
    const result = await init(['content']);
    const manifest = await readManifest(result.projectRoot);
    const recorded = manifest.modules.find((module) => module.id === 'base')!.files[
      'nuxt.config.ts'
    ];
    const onDisk = hashContent(await readFile(join(result.projectRoot, 'nuxt.config.ts'), 'utf8'));
    expect(recorded).toBe(onDisk);
  });
});
```

Add `hashContent` to the existing `../../src/util/fs` import at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/commands/init.test.ts -t "post-merge hash"`
Expected: FAIL — recorded hash is the pre-merge render hash.

- [ ] **Step 3: Rehash after merging**

In `runInit`, replace the structured-merge loop body's final line so it records the new hash. After `await writeJsonAtomically(path, document);` add:

```ts
const merged = await readFile(path, 'utf8');
const renderedFile = rendered.find((candidate) => candidate.path === file);
if (renderedFile) renderedFile.hash = hashContent(merged);
```

and extend the `../util/fs` import to include `hashContent`.

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/commands/init.test.ts && npm run typecheck`
Expected: PASS (8 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/commands/init.ts packages/create-nuxt-starter/test/commands/init.test.ts
git commit -m "fix(cli): hash structured targets after merging fragments"
```

---

### Task 15: CLI wiring

Makes the package runnable: citty command, clack prompts, `CliError` handling, and the bundled registry.

**Files:**

- Create: `packages/create-nuxt-starter/src/cli.ts`
- Create: `packages/create-nuxt-starter/registry/registry.json`
- Create: `packages/create-nuxt-starter/README.md`
- Create: `packages/create-nuxt-starter/test/cli.test.ts`

**Interfaces:**

- Consumes: `runInit`, `loadRegistry`, `resolveModules`, `CliError`.
- Produces: `main(argv: string[]): Promise<number>` — returns a process exit code; `runMain()` invoked by the bin entry.

- [ ] **Step 1: Create the bundled registry**

`registry/registry.json` — the real kit, one module until Plan 3 splits it:

```json
{
  "schemaVersion": 2,
  "version": "0.2.0",
  "kit": {
    "template": "github:No-Name-Studio-VN/Nuxt-Starter-Kit",
    "revision": "2f7f65d"
  },
  "modules": [
    {
      "id": "full-starter",
      "title": "Full Nuxt Starter Kit",
      "description": "The complete starter kit. Plan 3 splits this into individual modules.",
      "version": "0.2.0",
      "paths": ["**/*"],
      "notes": [
        "Configure Cloudflare D1 and KV bindings before deploying.",
        "Replace the Sentry, OAuth, Turnstile, and Studio placeholders with your own settings."
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

```ts
// test/cli.test.ts
import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli';

describe('main', () => {
  it('reports CliError messages without a stack trace and exits non-zero', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main([
      'init',
      '--modules',
      'not-a-module',
      '--yes',
      '--dir',
      '/tmp/nsk-cli-test',
    ]);
    expect(exitCode).toBe(1);
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/Unknown module "not-a-module"/);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toMatch(/at .*cli\.ts/);
    errorSpy.mockRestore();
  });

  it('lists modules from the bundled registry', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitCode = await main(['modules']);
    expect(exitCode).toBe(0);
    expect(logSpy.mock.calls.flat().join(' ')).toMatch(/full-starter/);
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL — cannot resolve `../src/cli`.

- [ ] **Step 4: Write `src/cli.ts`**

```ts
import { intro, isCancel, multiselect, outro, text } from '@clack/prompts';
import { defineCommand, runCommand } from 'citty';
import { runInit } from './commands/init';
import { CliError } from './errors';
import { loadRegistry } from './registry/load';
import type { Registry } from './registry/schema';
import type { Placeholders } from './render/placeholders';

function cancelled(value: unknown): never {
  throw new CliError('Cancelled.');
}

async function promptModules(registry: Registry): Promise<string[]> {
  const selection = await multiselect({
    message: 'Which modules do you want?',
    options: registry.modules.map((module) => ({
      value: module.id,
      label: module.title,
      hint: module.description,
    })),
    required: true,
  });
  if (isCancel(selection)) cancelled(selection);
  return selection as string[];
}

async function promptPlaceholders(defaultName: string): Promise<Placeholders> {
  const placeholders: Placeholders = {};
  const projectName = await text({
    message: 'Project name',
    defaultValue: defaultName,
    placeholder: defaultName,
  });
  if (isCancel(projectName)) cancelled(projectName);
  placeholders.PROJECT_NAME = projectName;

  const description = await text({
    message: 'Description',
    defaultValue: '',
    placeholder: 'A Nuxt application',
  });
  if (isCancel(description)) cancelled(description);
  placeholders.PROJECT_DESCRIPTION = description;
  return placeholders;
}

const initCommand = defineCommand({
  meta: { name: 'init', description: 'Create a new project from the starter kit.' },
  args: {
    dir: { type: 'string', description: 'Target directory', default: '.' },
    modules: { type: 'string', description: 'Comma-separated module ids (skips the picker)' },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
    kit: { type: 'string', description: 'Path to a local kit checkout instead of downloading' },
    yes: { type: 'boolean', description: 'Skip prompts and use defaults', default: false },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const interactive = !args.yes && process.stdout.isTTY === true;
    if (interactive) intro('Nuxt Starter Kit');

    const moduleIds = args.modules
      ? args.modules
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : interactive
        ? await promptModules(registry)
        : registry.modules.map((module) => module.id);

    const defaultName =
      args.dir === '.' ? 'my-app' : (args.dir.split('/').filter(Boolean).at(-1) ?? 'my-app');
    const placeholders = interactive
      ? await promptPlaceholders(defaultName)
      : { PROJECT_NAME: defaultName, PROJECT_DESCRIPTION: '' };

    const result = await runInit({
      registry,
      targetDir: args.dir,
      moduleIds,
      placeholders,
      ...(args.kit ? { localKitRoot: args.kit } : {}),
    });

    const summary = `Created ${result.projectRoot} with ${result.moduleIds.join(', ')} (${result.fileCount} files).`;
    if (interactive) outro(summary);
    else console.log(summary);

    for (const note of result.notes) console.log(`note: ${note}`);
    if (result.env.length > 0)
      console.log(`Set these environment variables: ${result.env.join(', ')}`);
  },
});

const modulesCommand = defineCommand({
  meta: { name: 'modules', description: 'List modules in the registry.' },
  args: { registry: { type: 'string', description: 'Path to an alternative registry.json' } },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    for (const module of registry.modules) {
      const requires =
        module.requires.length > 0 ? ` (requires ${module.requires.join(', ')})` : '';
      console.log(`${module.id}@${module.version}${requires} — ${module.description}`);
    }
  },
});

const rootCommand = defineCommand({
  meta: { name: 'nuxt-starter', description: 'Create and upgrade Nuxt Starter Kit projects.' },
  subCommands: { init: initCommand, modules: modulesCommand },
});

export async function main(argv: string[]): Promise<number> {
  try {
    await runCommand(rootCommand, { rawArgs: argv });
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

export async function runMain(): Promise<void> {
  process.exitCode = await main(process.argv.slice(2));
}
```

Note: `cancelled` takes its argument only so call sites read clearly; `noUnusedLocals` applies to declarations, not parameters, so this compiles.

- [ ] **Step 5: Point the bin entry at the build**

Overwrite `bin/nuxt-starter.mjs` (the shebang must be the very first line of the file):

```js
#!/usr/bin/env node
import { runMain } from '../dist/cli.mjs';

await runMain();
```

`package.json` already points `bin` here from Task 1; no change needed.

- [ ] **Step 6: Verify tests pass and the build works**

Run: `npx vitest run test/cli.test.ts && npm run typecheck && npm run build`
Expected: PASS, typecheck clean, `dist/cli.mjs` emitted.

- [ ] **Step 7: Smoke-test the real CLI end to end**

```bash
node bin/nuxt-starter.mjs modules
node bin/nuxt-starter.mjs init --dir /tmp/nsk-smoke --yes --kit test/fixtures/kit-v1 --registry test/fixtures/kit-v1/registry.json --modules content
ls -R /tmp/nsk-smoke && cat /tmp/nsk-smoke/.nuxt-starter/manifest.json
```

Expected: `modules` lists `full-starter`; the generated project contains `content.config.ts`, no `InstallPrompter.vue`, and a manifest listing `base` and `content`.

- [ ] **Step 8: Write `README.md`**

````markdown
# create-nuxt-starter

Create and upgrade modular Nuxt Starter Kit projects.

```bash
npx @no-name-studio/create-nuxt-starter@latest init my-app
```

## Commands

- `init [--dir <path>] [--modules a,b] [--yes]` — generate a project from selected modules.
- `modules` — list the modules in the registry.

Generated projects carry `.nuxt-starter/manifest.json`, recording the modules installed and the kit revision they came from. Do not delete it — upgrades depend on it.

## Authoring markers

Shared kit files delimit module fragments with markers, in whatever comment syntax the file uses:

```ts
// <nsk:content>
content: {},
// </nsk:content>
```

Blocks cannot nest, and every block needs a matching close.
````

- [ ] **Step 9: Commit**

```bash
git add -A packages/create-nuxt-starter
git commit -m "feat(cli): wire up the init and modules commands"
```

---

## Self-Review

**Spec coverage.** Registry v2 → Task 4. Dependency/conflict resolution → Task 5. Marker blocks (parse, one owner, damage errors) → Tasks 6–7. Render determinism (verbatim copy + block deletion + literal tokens, render version in the manifest) → Tasks 8, 10, 11. Project manifest (single revision, placeholders, per-file pristine hashes, orphaned paths) → Task 11. Structured fragments unioned into JSON → Tasks 13–14. Pinned kit fetching → Task 12. `init` → Tasks 13–15. Fixture-kit testing → Task 9.

**Deferred to later plans, by design:** three-way merge, `upgrade`, `status`, `diff`, clean-git-tree checks, `git init` on generate, dependency install (Plan 2); `add`/`remove`, reference-counted fragment removal, real kit modularization, CI matrix and registry↔kit consistency check (Plan 3). Reference counting is _recorded_ but not _consumed_ in Plan 1 — Task 11 stores per-module file ownership, and Plan 3 adds the structured-fragment provenance needed for removal.

**Known deviations from the spec, deliberate:**

- The spec says "diff3"; Plan 2 will implement it with `git merge-file`, which produces identical semantics and standard conflict markers with no merge algorithm to maintain. Git is already a hard requirement. Verified: exit code 0 = clean, ≥1 = conflict count, `--diff3` includes the base section.
- Marker parsing is comment-syntax-agnostic (one token regex) rather than a per-extension syntax table. Same authoring conventions, less code.

**Placeholder scan:** no TBDs. Every code step contains complete, runnable code; every test step contains real assertions.

**Type consistency:** `RenderedFile` (Task 10) is consumed by `buildManifest` (Task 11) and mutated in Task 14 — hence `rendered` is a mutable array, not `readonly`. `Placeholders` is `Record<string, string>` throughout. `CliError` is the only user-facing error type. `fetchKit`'s optional `localKitRoot` is passed with conditional spreads because `exactOptionalPropertyTypes` forbids passing `undefined` explicitly.
