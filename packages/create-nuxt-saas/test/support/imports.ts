import { posix } from 'node:path';

/**
 * Matches the specifier of an import, a re-export, a dynamic import, and a
 * side-effect import in one pass.
 *
 * Deliberately loose: it also matches things like `Array.from('abc')`. A false
 * positive costs nothing, because a specifier that resolves to no kit file is
 * treated as external and dropped — whereas a missed import would be a hole in
 * the ownership check. Kept free of nested quantifiers so a large source file
 * cannot make it backtrack.
 */
const SPECIFIER_PATTERN = /(?:from|import)\s*(?:\(\s*)?['"]([^'"\n]+)['"]/g;

/** Files whose text can carry an import worth resolving. */
const CODE_EXTENSIONS = ['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.vue'];

/**
 * Extensions tried when a specifier omits one, in resolution order. `.d.ts`
 * matters here: several of the kit's model types are declaration files imported
 * without any extension.
 */
const RESOLVED_EXTENSIONS = ['', '.ts', '.d.ts', '.vue', '.mts', '.js', '.mjs', '.json'];

/** Nuxt path aliases, longest prefix first so `~~/` never matches as `~/`. */
const ALIASES: Array<{ prefix: string; root: string }> = [
  { prefix: '#shared/', root: 'shared' },
  { prefix: '~~/', root: '' },
  { prefix: '@@/', root: '' },
  { prefix: '~/', root: 'app' },
  { prefix: '@/', root: 'app' },
];

export function isCodeFile(path: string): boolean {
  return CODE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

export interface KitImport {
  specifier: string;
  /** 0-indexed, to match the line numbering marker blocks use. */
  line: number;
}

/** Offsets at which each line begins, for turning a match index into a line. */
function lineStarts(contents: string): number[] {
  const starts = [0];
  for (
    let index = contents.indexOf('\n');
    index !== -1;
    index = contents.indexOf('\n', index + 1)
  ) {
    starts.push(index + 1);
  }
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * Every import in the file, with the line it sits on.
 *
 * The line matters as much as the specifier: an import inside a marker block
 * belongs to that block's module, not to the module that owns the file, and it
 * disappears along with the block when the module is not installed.
 */
export function extractImports(contents: string): KitImport[] {
  const starts = lineStarts(contents);
  const imports: KitImport[] = [];
  for (const match of contents.matchAll(SPECIFIER_PATTERN)) {
    const specifier = match[1];
    if (specifier === undefined || match.index === undefined) continue;
    imports.push({ specifier, line: lineAt(starts, match.index) });
  }
  return imports;
}

/**
 * The npm package a specifier names, or null when it names something else.
 *
 * `@scope/pkg/deep` and `pkg/deep` both reduce to the installable package, which
 * is the unit `package.json` declares and therefore the unit ownership applies
 * to. Relative paths, Nuxt aliases, virtual modules and node builtins are not
 * packages.
 */
export function toPackageName(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('#') || specifier.startsWith('node:')) {
    return null;
  }
  if (ALIASES.some(({ prefix }) => specifier.startsWith(prefix))) return null;

  const segments = specifier.split('/');
  const name = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  return name === undefined || name.length === 0 ? null : name;
}

/** The kit-relative path a specifier points at, before extensions are tried. */
function toKitPath(fromPath: string, specifier: string): string | null {
  if (specifier.startsWith('.')) {
    return posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  }
  for (const { prefix, root } of ALIASES) {
    if (specifier.startsWith(prefix)) {
      return posix.join(root, specifier.slice(prefix.length));
    }
  }
  // Bare package names and Nuxt's virtual modules (#app, #imports, #build).
  return null;
}

/**
 * Resolves a specifier to the kit file it names, or null when it names something
 * outside the kit — an npm package, a Nuxt virtual module, or generated code.
 *
 * Only membership of `kitFiles` decides this. Resolving against the real
 * filesystem would also find `node_modules` and `.nuxt`, neither of which a
 * released kit contains.
 */
export function resolveKitImport(
  fromPath: string,
  specifier: string,
  kitFiles: ReadonlySet<string>,
): string | null {
  const base = toKitPath(fromPath, specifier);
  if (base === null || base.startsWith('..')) return null;

  for (const extension of RESOLVED_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (kitFiles.has(candidate)) return candidate;
  }
  for (const extension of RESOLVED_EXTENSIONS) {
    const candidate = posix.join(base, `index${extension}`);
    if (kitFiles.has(candidate)) return candidate;
  }
  return null;
}
