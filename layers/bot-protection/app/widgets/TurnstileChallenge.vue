<script setup lang="ts">
import { TURNSTILE_TEST_SITE_KEY } from '../../shared/constants/turnstile';

const token = defineModel<string>();
const config = useRuntimeConfig().public;
const turnstile = config.turnstile;
const siteKey = import.meta.dev && config.botProtection?.devTestKeys
  ? TURNSTILE_TEST_SITE_KEY
  : typeof turnstile === 'object' && turnstile && 'siteKey' in turnstile && typeof turnstile.siteKey === 'string'
    ? turnstile.siteKey
    : undefined;
const failed = ref(false);
const attempt = ref(0);

function retry() {
  token.value = '';
  failed.value = false;
  attempt.value += 1;
}

const options = {
  size: 'flexible',
  appearance: 'interaction-only',
  'refresh-expired': 'manual',
  'expired-callback': retry,
  'error-callback': () => {
    token.value = '';
    failed.value = true;
  },
};
</script>

<template>
  <NuxtTurnstile v-if="siteKey" :key="attempt" v-model="token" :site-key="siteKey" :options="options" />
  <Alert v-if="!siteKey || failed" variant="destructive" role="alert">
    <AlertDescription>{{ $t('bot_protection.unavailable') }}</AlertDescription>
    <Button v-if="siteKey" type="button" variant="outline" size="sm" class="mt-2" @click="retry">
      {{ $t('bot_protection.retry') }}
    </Button>
  </Alert>
</template>
