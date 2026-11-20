<script setup lang="ts">
import { Copy } from '@lucide/vue';
import { toast } from 'vue-sonner';
import type { TwoFactorBackupCodesPayload } from '#layers/auth-2fa/types/twoFactor';

const props = defineProps<TwoFactorBackupCodesPayload>();
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(props.backupCodes.join('\n'));
    toast.success(t('settings.two_factor.codes_copied'));
  } catch {
    toast.error(t('settings.two_factor.copy_failed'));
  }
}
</script>

<template>
  <ul class="grid grid-cols-2 gap-2 rounded-md border bg-muted p-3 text-center" role="list">
    <li v-for="code in backupCodes" :key="code"><code class="font-mono text-sm select-all">{{ code }}</code></li>
  </ul>
  <DialogFooter>
    <Button type="button" variant="outline" @click="copyCodes">
      <Copy data-icon="inline-start" aria-hidden="true" />
      {{ t('settings.two_factor.copy_codes') }}
    </Button>
    <Button type="button" @click="emit('done')">{{ t('settings.two_factor.done') }}</Button>
  </DialogFooter>
</template>
