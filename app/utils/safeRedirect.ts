/**
 * A route query value as vue-router models it: a string, `null` for a bare flag,
 * or an array of either when the key repeats.
 */
type QueryString = string | null | undefined | readonly (string | null)[];

function readQueryString(value: QueryString) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return '';
}

export function getQueryString(value: QueryString) {
  return readQueryString(value);
}

export function safeRedirectPath(value: QueryString, fallback = '/') {
  const rawValue = readQueryString(value);

  if (!rawValue) {
    return fallback;
  }

  try {
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const target = new URL(rawValue, origin);
    if (target.origin !== origin) {
      return fallback;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
