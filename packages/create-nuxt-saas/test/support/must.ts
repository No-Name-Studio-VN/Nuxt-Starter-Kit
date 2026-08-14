/**
 * Narrows away `undefined` in tests without a non-null assertion, failing with a
 * useful message instead of a `TypeError` several lines later.
 */
export function must<T>(value: T | undefined | null, label = 'value'): T {
  if (value === undefined || value === null) {
    throw new Error(`Expected ${label} to be defined, got ${String(value)}.`);
  }
  return value;
}
