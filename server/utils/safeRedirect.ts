import type { H3Event } from 'h3'

export function safeRedirectPath(event: H3Event, value: string | undefined, fallback = '/') {
  if (!value) {
    return fallback
  }

  try {
    const origin = getRequestURL(event).origin
    const parsed = new URL(value, origin)
    if (parsed.origin !== origin) {
      return fallback
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  }
  catch {
    return fallback
  }
}
