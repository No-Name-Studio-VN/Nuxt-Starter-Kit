<script setup lang="ts">
import { Copy } from '@lucide/vue';
import { motion, useReducedMotion } from 'motion-v';
import { renderSVG } from 'uqr';
import { Field as VeeField, useForm } from 'vee-validate';
import { REGEXP_ONLY_DIGITS } from 'vue-input-otp';
import { toast } from 'vue-sonner';
import TwoFactorBackupCodes from './TwoFactorBackupCodes.vue';
import TwoFactorPasswordForm from './TwoFactorPasswordForm.vue';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp';
import { TOTP_LENGTH } from '#layers/auth-2fa/shared/constants/totp';
import { verifyTotpSchema } from '#layers/auth-2fa/shared/schemas/twoFactorSchema';
import type { VerifyTotpInput } from '#layers/auth-2fa/shared/schemas/twoFactorSchema';
import { twoFactorRoutes } from '#layers/auth-2fa/shared/twoFactorRoutes';
import type { TwoFactorSetupPayload, TwoFactorBackupCodesPayload } from '#layers/auth-2fa/types/twoFactor';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ enabled: []; 'status-stale': [] }>();
const { t } = useI18n();
const reducedMotion = useReducedMotion();
const open = shallowRef(false);
const busy = shallowRef(false);
const setup = shallowRef<TwoFactorSetupPayload>();
const backupCodes = shallowRef<string[]>();
const stepHeading = useTemplateRef('step-heading');
const codeId = useId();
const step = computed(() => backupCodes.value ? 'backup' : setup.value ? 'verify' : 'password');
const qrSrc = computed(() => {
  if (!setup.value) return undefined;
  try {
    const svg = renderSVG(setup.value.uri, { border: 4 });
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } catch {
    return undefined;
  }
});
const { handleSubmit, meta, resetForm, setFieldError } = useForm<VerifyTotpInput>({
  initialValues: { code: '' },
  validationSchema: verifyTotpSchema,
});

function clearSetup() {
  setup.value = undefined;
  backupCodes.value = undefined;
  resetForm();
}

function updateOpen(value: boolean) {
  if (busy.value || (!value && backupCodes.value)) return;
  open.value = value;
  if (!value) clearSetup();
}

watch(step, async () => {
  if (!open.value) return;
  await nextTick();
  stepHeading.value?.focus();
});

async function startSetup(password: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    const response = await apiRequest<ApiResponse<TwoFactorSetupPayload>>(twoFactorRoutes.MY_2FA_SETUP, {
      method: 'POST',
      body: { password },
    });
    if (!response.success) throw response;
    setup.value = response.data;
  } catch (error) {
    const { code } = parseApiError(error);
    if (code === 'INVALID_PASSWORD') return 'validation.current_password_incorrect';
    if (code === 'TWO_FACTOR_ALREADY_ENABLED') {
      toast.info(t('settings.two_factor.already_enabled'));
      open.value = false;
      clearSetup();
      emit('status-stale');
    } else {
      toast.error(t('settings.two_factor.setup_failed'));
    }
  } finally {
    busy.value = false;
  }
}

const verifyCode = handleSubmit(async ({ code }) => {
  if (!setup.value || busy.value) return;
  busy.value = true;
  try {
    const response = await apiRequest<ApiResponse<TwoFactorBackupCodesPayload>>(twoFactorRoutes.MY_2FA_VERIFY, {
      method: 'POST',
      body: { code },
    });
    if (!response.success) throw response;
    backupCodes.value = response.data.backupCodes;
    setup.value = undefined;
    resetForm();
  } catch (error) {
    const parsed = parseApiError(error);
    if (parsed.code === 'INVALID_TWO_FACTOR_CODE') {
      setFieldError('code', 'settings.two_factor.invalid_code');
    } else if (parsed.code === 'TWO_FACTOR_ALREADY_ENABLED' || parsed.code === 'TWO_FACTOR_CHANGED') {
      toast.info(t(parsed.code === 'TWO_FACTOR_ALREADY_ENABLED'
        ? 'settings.two_factor.already_enabled'
        : 'settings.two_factor.setup_expired'));
      open.value = false;
      clearSetup();
      emit('status-stale');
    } else if (parsed.code === 'TWO_FACTOR_SETUP_NOT_FOUND') {
      toast.error(t('settings.two_factor.setup_expired'));
      clearSetup();
    } else {
      toast.error(t('settings.two_factor.verify_failed'));
    }
  } finally {
    busy.value = false;
  }
});

async function copySetupKey(secret: string) {
  try {
    await navigator.clipboard.writeText(secret);
    toast.success(t('settings.two_factor.key_copied'));
  } catch {
    toast.error(t('settings.two_factor.copy_failed'));
  }
}

function finish() {
  open.value = false;
  clearSetup();
  toast.success(t('settings.two_factor.enabled_toast'));
  emit('enabled');
}
</script>

<template>
  <Dialog :open="open" @update:open="updateOpen">
    <DialogTrigger as-child>
      <Button type="button" :variant="disabled ? 'outline' : 'default'" :disabled="disabled">
        {{ t('settings.two_factor.enable') }}
      </Button>
    </DialogTrigger>
    <DialogContent
      :show-close-button="false"
      class="max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto sm:max-w-md"
      @escape-key-down="(event) => { if (busy || backupCodes) event.preventDefault(); }"
      @interact-outside="(event) => { if (busy || backupCodes) event.preventDefault(); }"
    >
      <DialogHeader>
        <DialogTitle><span ref="step-heading" class="outline-none" tabindex="-1">{{ t(`settings.two_factor.${step}_title`) }}</span></DialogTitle>
        <DialogDescription>{{ t(`settings.two_factor.${step}_description`) }}</DialogDescription>
      </DialogHeader>
      <TwoFactorPasswordForm
        v-if="step === 'password'"
        :action-label="t('settings.two_factor.continue')"
        :busy="busy"
        :submit-password="startSetup"
        @cancel="updateOpen(false)"
      />
      <template v-else-if="setup">
        <motion.img
          v-if="qrSrc"
          :src="qrSrc"
          :alt="t('settings.two_factor.qr_alt')"
          :initial="reducedMotion ? false : { opacity: 0 }"
          :animate="{ opacity: 1 }"
          :transition="{ duration: 0.18 }"
          width="176"
          height="176"
          class="mx-auto size-44 max-w-full rounded-md border"
        />
        <div class="flex min-w-0 flex-col gap-1.5">
          <p class="text-sm font-medium">{{ t('settings.two_factor.manual_key') }}</p>
          <div class="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-muted p-2">
            <code class="min-w-0 font-mono text-sm wrap-anywhere select-all">{{ setup.secret }}</code>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="shrink-0"
              :aria-label="t('settings.two_factor.copy_key')"
              @click="copySetupKey(setup.secret)"
            >
              <Copy aria-hidden="true" />
            </Button>
          </div>
        </div>
        <form class="flex flex-col gap-4" novalidate @submit="verifyCode">
          <FieldGroup>
            <VeeField v-slot="{ field, errors }" name="code">
              <Field :data-invalid="!!errors.length">
                <FieldLabel :for="codeId">{{ t('settings.two_factor.code') }}</FieldLabel>
                <InputOTP
                  :id="codeId"
                  :model-value="field.value"
                  :maxlength="TOTP_LENGTH"
                  :pattern="REGEXP_ONLY_DIGITS"
                  :disabled="busy"
                  :aria-invalid="!!errors.length"
                  :aria-describedby="errors.length ? `${codeId}-error` : undefined"
                  autocomplete="one-time-code"
                  @update:model-value="field.onChange"
                  @blur="field.onBlur"
                >
                  <InputOTPGroup>
                    <InputOTPSlot v-for="(_, index) in TOTP_LENGTH" :key="index" :index="index" class="size-8 sm:size-9" />
                  </InputOTPGroup>
                </InputOTP>
                <FieldError v-if="errors.length" :id="`${codeId}-error`" :errors="[t(errors[0] === 'settings.two_factor.invalid_code' ? errors[0] : 'settings.two_factor.code_format')]" />
              </Field>
            </VeeField>
          </FieldGroup>
          <DialogFooter>
            <DialogClose as-child>
              <Button type="button" variant="outline" :disabled="busy">{{ t('settings.cancel') }}</Button>
            </DialogClose>
            <Button type="submit" :disabled="busy || !meta.valid">
              <Spinner v-if="busy" data-icon="inline-start" aria-hidden="true" />
              {{ t('settings.two_factor.verify') }}
            </Button>
          </DialogFooter>
        </form>
      </template>
      <TwoFactorBackupCodes v-else-if="backupCodes" :backup-codes="backupCodes" @done="finish" />
    </DialogContent>
  </Dialog>
</template>
