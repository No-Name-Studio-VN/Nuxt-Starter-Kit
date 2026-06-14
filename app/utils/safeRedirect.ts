function readQueryString(value: string | string[] | null | undefined) {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value[0] || ''
  }

  return ''
}

export function getQueryString(value: string | string[] | null | undefined) {
  return readQueryString(value)
}

export function safeRedirectPath(value: string | string[] | null | undefined, fallback = '/') {
  const rawValue = readQueryString(value)

  if (!rawValue) {
    return fallback
  }

  try {
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    const target = new URL(rawValue, origin)
    if (target.origin !== origin) {
      return fallback
    }

    return `${target.pathname}${target.search}${target.hash}`
  }
  catch {
    return fallback
  }
}
