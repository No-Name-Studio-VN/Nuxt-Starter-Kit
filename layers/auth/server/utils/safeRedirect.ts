import type { H3Event } from 'h3';
import type { RequestEvent } from 'nuxt/server';
import { getRequestURL as getNuxtRequestURL } from 'nuxt/server';

export function safeRedirectPath(event: H3Event | RequestEvent, value: string | undefined, fallback = '/') {
  if (!value) {
    return fallback;
  }

  try {
    const options = { xForwardedProto: true };
    const { origin } = 'url' in event ? getNuxtRequestURL(event, options) : getRequestURL(event, options);
    const parsed = new URL(value, origin);
    // Returning a path that starts with two slashes is not a same-origin redirect.
    if (parsed.origin !== origin || parsed.pathname.startsWith('//')) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
