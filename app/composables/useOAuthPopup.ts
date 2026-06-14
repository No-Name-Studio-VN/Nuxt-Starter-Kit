import { apiRoutes } from '#shared/apiRoutes'
import { apiRequest } from '@/utils/apiRequest'
import { parseApiError } from '@/utils/apiError'
import type { ApiResponse } from '~~/types/api'
import {
  OAUTH_POPUP_COMPLETE_CHANNEL,
  OAUTH_POPUP_COMPLETE_STORAGE_KEY,
  type OAuthPopupCompleteMessage,
  type OAuthUrlData,
} from '~~/types/auth'

type OAuthAction = 'login' | 'link'

interface UseOAuthPopupOptions {
  onComplete?: (path: string) => void
  onError?: (message: string) => void
}

export function useOAuthPopup(options: UseOAuthPopupOptions = {}) {
  const oauthLoadingProvider = ref<string | null>(null)
  const oauthPopup = ref<Window | null>(null)
  const oauthPopupTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
  const oauthPopupCloseMonitor = ref<ReturnType<typeof setInterval> | null>(null)
  let oauthBroadcastChannel: BroadcastChannel | null = null

  function stopOAuthPopupTimeout() {
    if (oauthPopupTimeout.value) {
      clearTimeout(oauthPopupTimeout.value)
      oauthPopupTimeout.value = null
    }
  }

  function stopOAuthPopupCloseMonitor() {
    if (oauthPopupCloseMonitor.value) {
      clearInterval(oauthPopupCloseMonitor.value)
      oauthPopupCloseMonitor.value = null
    }
  }

  function resetOAuthPopup() {
    stopOAuthPopupCloseMonitor()
    stopOAuthPopupTimeout()
    oauthPopup.value = null
    oauthLoadingProvider.value = null
  }

  function onOAuthPopupComplete(event: MessageEvent<OAuthPopupCompleteMessage>) {
    if (event.origin !== window.location.origin) return
    handleOAuthPopupMessage(event.data, event.source)
  }

  function handleOAuthPopupMessage(data: OAuthPopupCompleteMessage | unknown, source?: MessageEventSource | null) {
    if (!data || typeof data !== 'object') return
    if (!('type' in data) || data.type !== 'oauth:complete') return
    if (!('url' in data) || typeof data.url !== 'string') return
    if (source && oauthPopup.value && source !== oauthPopup.value) return

    resetOAuthPopup()

    let target: URL
    try {
      target = new URL(data.url)
    }
    catch {
      options.onError?.('Authentication completed but response URL was invalid. Please try again.')
      return
    }

    const targetPath = `${target.pathname}${target.search}${target.hash}`
    if (options.onComplete) {
      options.onComplete(targetPath)
      return
    }

    window.location.assign(targetPath)
  }

  function onOAuthStorageComplete(event: StorageEvent) {
    if (event.key !== OAUTH_POPUP_COMPLETE_STORAGE_KEY || !event.newValue) return

    try {
      handleOAuthPopupMessage(JSON.parse(event.newValue))
    }
    catch {
      options.onError?.('Authentication completed but response payload was invalid. Please try again.')
    }
  }

  async function startOAuth(provider: string, action: OAuthAction = 'login', redirectTo?: string) {
    if (oauthLoadingProvider.value) return

    oauthLoadingProvider.value = provider

    try {
      const response = await apiRequest<ApiResponse<OAuthUrlData>>(apiRoutes.AUTH_OAUTH_URL, {
        method: 'POST',
        body: { provider, action, redirectTo },
      })
      if (!response.success) {
        throw new Error(response.error.message)
      }

      const popupWidth = Math.min(560, window.outerWidth - 40)
      const popupHeight = Math.min(720, window.outerHeight - 80)
      const popupLeft = window.screenX + Math.max(0, (window.outerWidth - popupWidth) / 2)
      const popupTop = window.screenY + Math.max(0, (window.outerHeight - popupHeight) / 2)
      const popup = window.open(
        response.data.url,
        `oauth-${provider}`,
        `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},location=0,resizable,scrollbars,toolbar=0,menubar=0,popup=true`,
      )

      if (!popup) {
        throw new Error('Popup blocked')
      }

      popup.focus()
      oauthPopup.value = popup
      stopOAuthPopupCloseMonitor()
      stopOAuthPopupTimeout()

      oauthPopupCloseMonitor.value = setInterval(() => {
        if (!oauthPopup.value) {
          stopOAuthPopupCloseMonitor()
          return
        }

        let isClosed = false
        try {
          isClosed = oauthPopup.value.closed
        }
        catch {
          return
        }

        if (!isClosed) {
          return
        }

        resetOAuthPopup()
      }, 500)

      oauthPopupTimeout.value = setTimeout(() => {
        resetOAuthPopup()
        options.onError?.('OAuth session timed out or popup was closed. Please try again.')
      }, 120000)
    }
    catch (err: unknown) {
      resetOAuthPopup()
      options.onError?.(parseApiError(err, 'Unable to continue with provider right now. Please try again.').message)
    }
  }

  onMounted(() => {
    window.addEventListener('message', onOAuthPopupComplete)
    window.addEventListener('storage', onOAuthStorageComplete)

    if ('BroadcastChannel' in window) {
      oauthBroadcastChannel = new BroadcastChannel(OAUTH_POPUP_COMPLETE_CHANNEL)
      oauthBroadcastChannel.onmessage = event => handleOAuthPopupMessage(event.data)
    }
  })

  onBeforeUnmount(() => {
    resetOAuthPopup()
    window.removeEventListener('message', onOAuthPopupComplete)
    window.removeEventListener('storage', onOAuthStorageComplete)
    oauthBroadcastChannel?.close()
    oauthBroadcastChannel = null
  })

  return {
    oauthLoadingProvider,
    startOAuth,
    resetOAuthPopup,
  }
}
