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
