<script setup lang="ts">
import { BOT_PROTECTION_TOKEN_FIELD } from '#shared/constants/formChallenge';
import type { FormChallengeState } from '~~/types/botProtection';

const { challenge } = defineProps<{ challenge: FormChallengeState }>();
const { t } = useI18n();
const hasWidget = computed(() => getExtensions('form:challenge').some(({ id }) => id === challenge.provider));
</script>

<template>
  <template v-if="challenge.provider">
    <input type="hidden" :name="BOT_PROTECTION_TOKEN_FIELD" :value="challenge.token.value" />
    <ExtensionSlot
      v-if="hasWidget"
      :key="challenge.attempt.value"
      v-model="challenge.token.value"
      name="form:challenge"
      :entry-id="challenge.provider"
    />
    <Alert v-else variant="destructive" role="alert">
      <AlertDescription>{{ t('bot_protection.unavailable') }}</AlertDescription>
    </Alert>
  </template>
</template>
