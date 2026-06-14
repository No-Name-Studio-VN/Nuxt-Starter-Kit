<script setup lang="ts">
import {
  OAUTH_POPUP_COMPLETE_CHANNEL,
  OAUTH_POPUP_COMPLETE_STORAGE_KEY,
  type OAuthPopupCompleteMessage,
} from '~~/types/auth'
import { safeRedirectPath } from '@/utils/safeRedirect'

definePageMeta({
  layout: 'empty',
  title: 'Completing sign in',
})

const route = useRoute()

function notifyOAuthComplete(payload: OAuthPopupCompleteMessage) {
  try {
    window.opener?.postMessage(payload, window.location.origin)
  }
  catch {
    // The opener can be severed by cross-origin OAuth navigation.
  }

  try {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(OAUTH_POPUP_COMPLETE_CHANNEL)
      channel.postMessage(payload)
      channel.close()
    }
  }
  catch {
    // BroadcastChannel is a best-effort convenience path.
  }

  try {
    localStorage.setItem(OAUTH_POPUP_COMPLETE_STORAGE_KEY, JSON.stringify(payload))
    localStorage.removeItem(OAUTH_POPUP_COMPLETE_STORAGE_KEY)
  }
  catch {
    // Storage events are a best-effort fallback path.
  }
}

onMounted(() => {
  const redirectTo = safeRedirectPath(route.query.redirectTo)
  const target = new URL(redirectTo, window.location.origin)
  const payload: OAuthPopupCompleteMessage = {
    type: 'oauth:complete',
    url: target.href,
  }

  notifyOAuthComplete(payload)
  window.close()

  setTimeout(() => {
    window.location.assign(`${target.pathname}${target.search}${target.hash}`)
  }, 750)
})
</script>

<template>
  <div class="flex min-h-svh items-center justify-center bg-background px-6 text-center">
    <div class="flex flex-col gap-2">
      <h1 class="text-lg font-semibold">
        Completing sign in…
      </h1>
      <p class="text-sm text-muted-foreground">
        You can close this window if it does not close automatically.
      </p>
    </div>
  </div>
</template>
