import type { RouteMiddleware } from 'nuxt/app'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOnboardingRouteLocale, resolveOnboardingRedirect } from '../../../layers/auth/app/utils/onboardingRedirect'

afterEach(() => vi.unstubAllGlobals())

describe('onboarding global middleware', () => {
  it('gates an already loaded pending session on the unprefixed dashboard without looping', async () => {
    const fetch = vi.fn()
    const localePath = vi.fn((path: string) => path)
    const navigate = vi.fn()
    vi.stubGlobal('defineNuxtRouteMiddleware', (middleware: RouteMiddleware) => middleware)
    vi.stubGlobal('useUserSession', () => ({
      loggedIn: { value: true }, user: { value: { onboardingPending: true } }, ready: { value: true }, fetch,
    }))
    vi.stubGlobal('useRouteBaseName', () => (route: Parameters<RouteMiddleware>[0]) => route.name)
    vi.stubGlobal('useAppLocalePath', () => localePath)
    vi.stubGlobal('useNuxtApp', () => ({
      payload: {},
      $i18n: { locale: { value: 'vi' } },
      runWithContext: (callback: () => void) => callback(),
    }))
    vi.stubGlobal('navigateTo', navigate)
    const { default: middleware } = await import('../../../layers/auth/app/middleware/onboarding.global')
    const dashboard: Parameters<RouteMiddleware>[0] = {
      path: '/dashboard', fullPath: '/dashboard', name: 'dashboard', meta: { localeIndependent: true },
      params: {}, query: {}, hash: '', matched: [], redirectedFrom: undefined,
    }
    const onboarding: Parameters<RouteMiddleware>[0] = {
      ...dashboard, path: '/onboarding', fullPath: '/onboarding', name: 'onboarding',
    }

    await middleware(dashboard, dashboard)
    await middleware(onboarding, dashboard)

    expect(fetch).not.toHaveBeenCalled()
    expect(localePath).toHaveBeenCalledExactlyOnceWith('/onboarding', 'vi')
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/onboarding', { replace: true })
  })
})

describe('getOnboardingRouteLocale', () => {
  it('uses the incoming route prefix rather than the current page locale', () => {
    expect(getOnboardingRouteLocale('/vi/admin')).toBe('vi')
    expect(getOnboardingRouteLocale('/vi')).toBe('vi')
  })

  it('uses the default locale for unprefixed routes', () => {
    expect(getOnboardingRouteLocale('/settings/profile')).toBe('en')
    expect(getOnboardingRouteLocale('/vintage')).toBe('en')
  })
})

describe('resolveOnboardingRedirect', () => {
  it('redirects a pending user to onboarding from an app route', () => {
    expect(resolveOnboardingRedirect('/dashboard', 'dashboard', true)).toBe('/onboarding')
    expect(resolveOnboardingRedirect('/vi/admin', 'admin', true)).toBe('/onboarding')
  })

  it('lets a pending user stay on the shared onboarding route', () => {
    expect(resolveOnboardingRedirect('/onboarding', 'onboarding', true)).toBeNull()
    expect(resolveOnboardingRedirect('/onboarding/', undefined, true)).toBeNull()
  })

  it.each(['/auth/login', '/vi/auth/register', '/auth/logout', '/auth/oauth/popup', '/vi/auth/verify-email'])('allows a pending user to visit %s', (path) => {
    expect(resolveOnboardingRedirect(path, undefined, true)).toBeNull()
  })

  it('does not exempt routes just because their names start like auth routes', () => {
    expect(resolveOnboardingRedirect('/authorship', undefined, true)).toBe('/onboarding')
  })

  it('sends users who are not pending away from the shared onboarding route', () => {
    expect(resolveOnboardingRedirect('/onboarding', 'onboarding', false)).toBe('/')
    expect(resolveOnboardingRedirect('/onboarding/', undefined, false)).toBe('/')
  })

  it('does not gate other pages for users who are not pending', () => {
    expect(resolveOnboardingRedirect('/vi/admin', 'admin', false)).toBeNull()
  })
})
