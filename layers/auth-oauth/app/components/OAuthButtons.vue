<script setup lang="ts">
import type { AuthMethodEmits, AuthMethodProps } from '#layers/auth/types/authMethods';
import { OAUTH_PROVIDERS } from '#layers/auth-oauth/shared/constants/oauthProviders';
import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import type { OAuthUrlPayload } from '#layers/auth-oauth/types/oauth';
import type { OAuthProviderId } from '#layers/auth-oauth/types/providers';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import type { ApiResponse } from '#layers/server-core/types/api';

const props = defineProps<AuthMethodProps>();
const emit = defineEmits<AuthMethodEmits>();
const { t } = useI18n();
const { data } = useNuxtData<ApiResponse<OAuthProviderId[]>>(oauthRoutes.PROVIDERS);
const providers = computed(() => (data.value?.success ? data.value.data : []));
const labelKey = computed(() =>
  props.mode === 'register' ? 'auth_oauth.sign_up_with' : 'auth_oauth.continue_with',
);

const oauthLoadingProvider = ref<OAuthProviderId | null>(null);
const oauthPopup = shallowRef<Window | null>(null);
const oauthPopupTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const oauthPopupCloseMonitor = ref<ReturnType<typeof setInterval> | null>(null);

function stopOAuthPopupTimeout() {
  if (oauthPopupTimeout.value) {
    clearTimeout(oauthPopupTimeout.value);
    oauthPopupTimeout.value = null;
  }
}

function stopOAuthPopupCloseMonitor() {
  if (oauthPopupCloseMonitor.value) {
    clearInterval(oauthPopupCloseMonitor.value);
    oauthPopupCloseMonitor.value = null;
  }
}

function onOAuthPopupComplete(message: { url: string }) {
  stopOAuthPopupCloseMonitor();
  stopOAuthPopupTimeout();
  oauthPopup.value = null;
  oauthLoadingProvider.value = null;
  emit('pending', false);

  let target: URL;
  try {
    target = new URL(message.url);
  } catch {
    emit('error', t('auth_oauth.invalid_response'));
    return;
  }

  if (target.origin !== window.location.origin || target.pathname.startsWith('//')) {
    emit('error', t('auth_oauth.invalid_response'));
    return;
  }
  emit('done', `${target.pathname}${target.search}${target.hash}`);
}

const oauthPopupListener = useOAuthPopupListener(onOAuthPopupComplete);

onMounted(() => {
  oauthPopupListener.start();
});

async function signInWithProvider(provider: OAuthProviderId) {
  if (props.pending || oauthLoadingProvider.value) return;

  oauthLoadingProvider.value = provider;
  emit('pending', true);

  try {
    const response = await apiRequest<ApiResponse<OAuthUrlPayload>>(oauthRoutes.URL, {
      method: 'POST',
      body: { provider, action: 'login', redirectTo: props.redirectTo },
    });
    if (!response.success) {
      throw response;
    }

    const popupWidth = Math.min(560, window.outerWidth - 40);
    const popupHeight = Math.min(720, window.outerHeight - 80);
    const popupLeft = window.screenX + Math.max(0, (window.outerWidth - popupWidth) / 2);
    const popupTop = window.screenY + Math.max(0, (window.outerHeight - popupHeight) / 2);
    const popup = window.open(
      response.data.url,
      `oauth-${provider}`,
      `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},location=0,resizable,scrollbars,toolbar=0,menubar=0,popup=true`,
    );

    if (!popup) {
      throw new Error(t('auth_oauth.popup_blocked'));
    }

    popup.focus();
    oauthPopup.value = popup;
    stopOAuthPopupCloseMonitor();
    stopOAuthPopupTimeout();

    oauthPopupCloseMonitor.value = setInterval(() => {
      if (!oauthPopup.value) {
        stopOAuthPopupCloseMonitor();
        return;
      }

      let isClosed = false;
      try {
        isClosed = oauthPopup.value.closed;
      } catch {
        return;
      }

      if (!isClosed) {
        return;
      }

      stopOAuthPopupCloseMonitor();
      stopOAuthPopupTimeout();
      oauthPopup.value = null;
      oauthLoadingProvider.value = null;
      emit('pending', false);
    }, 500);

    oauthPopupTimeout.value = setTimeout(() => {
      stopOAuthPopupCloseMonitor();
      stopOAuthPopupTimeout();
      oauthPopup.value = null;
      oauthLoadingProvider.value = null;
      emit('pending', false);
      emit('error', t('auth_oauth.popup_timed_out'));
    }, 120000);
  } catch (err) {
    stopOAuthPopupCloseMonitor();
    stopOAuthPopupTimeout();
    oauthPopup.value = null;
    oauthLoadingProvider.value = null;
    emit('pending', false);
    emit('error', parseApiError(err, t('auth_oauth.cannot_continue')).message);
  }
}

onBeforeUnmount(() => {
  stopOAuthPopupCloseMonitor();
  stopOAuthPopupTimeout();
  oauthPopupListener.stop();
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <Button
      v-for="provider in providers"
      :key="provider"
      type="button"
      variant="outline"
      class="h-10 w-full"
      :is-loading="oauthLoadingProvider === provider"
      :disabled="pending || oauthLoadingProvider !== null"
      @click="signInWithProvider(provider)"
    >
      <div class="flex size-4 items-center justify-center">
        <OAuthIcon :icon="OAUTH_PROVIDERS[provider].icon" />
      </div>
      {{ $t(labelKey, { provider: OAUTH_PROVIDERS[provider].label }) }}
    </Button>
  </div>
</template>
