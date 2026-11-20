<script setup lang="ts">
import { Fingerprint } from '@lucide/vue';
import { formatDate } from '@/lib/utils';
import SecurityRow from '#layers/auth/app/components/settings/SecurityRow.vue';
import type { PasskeyModel } from '#layers/auth-passkeys/types/models/passkey';

const props = defineProps<{ passkeys: PasskeyModel[]; onlySignInMethod: boolean }>();
defineSlots<{ actions(props: { passkey: PasskeyModel; label: string }): unknown }>();
const { t, locale } = useI18n();
// The existing endpoint sends display names rather than translation keys.
const nameKeys = new Map([
  ['Passkey', 'settings.passkeys.names.default'],
  ['Security Key (USB)', 'settings.passkeys.names.usb'],
  ['Security Key (NFC)', 'settings.passkeys.names.nfc'],
  ['Security Key (Bluetooth)', 'settings.passkeys.names.ble'],
  ['Device Biometric', 'settings.passkeys.names.internal'],
  ['Cross-device Passkey', 'settings.passkeys.names.hybrid'],
]);

function passkeyName(passkey: PasskeyModel) {
  const key = nameKeys.get(passkey.name);
  return key ? t(key) : passkey.name;
}

function passkeyDescription(passkey: PasskeyModel) {
  const parts = [t('settings.passkeys.created_on', { date: formatDate(passkey.createdAt, locale.value) })];
  if (passkey.lastUsedAt) parts.push(t('settings.passkeys.last_used_on', { date: formatDate(passkey.lastUsedAt, locale.value) }));
  if (props.onlySignInMethod) parts.push(t('settings.passkeys.only_sign_in_note'));
  return parts.join(' · ');
}
</script>

<template>
  <SecurityRow
    v-for="passkey in passkeys"
    :key="passkey.id"
    :title="passkeyName(passkey)"
    :description="passkeyDescription(passkey)"
  >
    <template #icon><Fingerprint aria-hidden="true" /></template>
    <template #actions>
      <slot name="actions" :passkey="passkey" :label="passkeyName(passkey)" />
    </template>
  </SecurityRow>
</template>
