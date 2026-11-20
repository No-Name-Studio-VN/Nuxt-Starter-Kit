<template><span class="hidden" aria-hidden="true"></span></template>

<script setup lang="ts">
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import type { ApiResponse } from '#layers/server-core/types/api';
import type { GoogleOneTapPayload } from '#layers/auth-oauth/types/oauth';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import type { GoogleCredentialResponse } from '#layers/auth-oauth/types/googleOneTap';
import {
  cancelGoogleOneTapPrompt,
  loadGoogleIdentityScript,
} from '#layers/auth-oauth/app/utils/googleOneTap';

const { loggedIn, fetch: refreshSession } = useUserSession();
const router = useRouter();
const { public: publicConfig } = useRuntimeConfig();

const googleClientId = computed(() => {
  const clientId = publicConfig.googleOneTapClientId;
  return typeof clientId === 'string' ? clientId.trim() : '';
});

let promptStarted = false;
let isCancelling = false;

function stopPrompt() {
  if (isCancelling) return;
  isCancelling = true;
  cancelGoogleOneTapPrompt();
  isCancelling = false;
}

async function submitCredential(response: GoogleCredentialResponse) {
  try {
    const result = await apiRequest<ApiResponse<GoogleOneTapPayload>>(oauthRoutes.GOOGLE_ONE_TAP, {
      method: 'POST',
      body: {
        credential: response.credential,
      },
    });

    if (result.success) {
      await refreshSession();
      if (result.data.status === 'created') {
        await router.push(authRoutes.ONBOARDING);
      }
      return;
    }
  } catch {
    // ignore
  }

  stopPrompt();
}

async function startPrompt() {
  if (promptStarted || loggedIn.value || !googleClientId.value) {
    if (loggedIn.value) {
      stopPrompt();
    }
    return;
  }

  promptStarted = true;

  const accountsId = await loadGoogleIdentityScript();
  if (!accountsId || loggedIn.value || !googleClientId.value) {
    promptStarted = false;
    return;
  }

  accountsId.initialize({
    client_id: googleClientId.value,
    callback: submitCredential,
    auto_select: true,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
  });

  accountsId.prompt();
}

watch(
  loggedIn,
  (value) => {
    if (value) {
      stopPrompt();
      return;
    }

    promptStarted = false;
    void startPrompt();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopPrompt();
});
</script>
