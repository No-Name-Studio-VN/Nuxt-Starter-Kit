<script setup lang="ts">
import { REGEXP_ONLY_DIGITS } from 'vue-input-otp';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp';
import { TOTP_LENGTH } from '#layers/auth-2fa/shared/constants/totp';
import { backupCodeSchema, totpCodeSchema } from '#layers/auth-2fa/shared/schemas/twoFactorSchema';
import { twoFactorRoutes } from '#layers/auth-2fa/shared/twoFactorRoutes';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { cn } from '@/lib/utils';
import type { ApiResponse } from '#layers/server-core/types/api';
import type { LoginStepEmits, LoginStepProps } from '#layers/auth/types/loginSteps';

const props = defineProps<LoginStepProps>();
const emit = defineEmits<LoginStepEmits>();

const { t } = useI18n();
const totpCode = ref('');
const useBackupCode = ref(false);
const authenticatorCodeSchema = totpCodeSchema();
const isCodeValid = computed(
  () =>
    (useBackupCode.value ? backupCodeSchema : authenticatorCodeSchema).safeParse(totpCode.value)
      .success,
);
const isLoading = ref(false);
const error = ref('');
const isShaking = ref(false);

function triggerShakeAnimation() {
  isShaking.value = true;
  setTimeout(() => {
    isShaking.value = false;
  }, 600);
}

function toggleCodeMode() {
  useBackupCode.value = !useBackupCode.value;
  totpCode.value = '';
  error.value = '';
}

function updateBackupCode(value: string | number) {
  totpCode.value = String(value).trim().toUpperCase();
}

const on2faSubmit = async () => {
  if (isLoading.value || !isCodeValid.value) return;
  isLoading.value = true;
  error.value = '';
  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      twoFactorRoutes.AUTH_LOGIN_2FA,
      {
        method: 'POST',
        body: { code: totpCode.value },
      },
    );
    if (!response.success) {
      throw response;
    }
    emit('done', props.redirectTo);
  } catch (failure) {
    const { code } = parseApiError(failure);
    if (code === 'SESSION_INVALID' || code === 'USER_NOT_FOUND') {
      error.value = 'auth.two_factor.session_expired';
    } else if (code === 'TOTP_ATTEMPT_LIMIT_EXCEEDED') {
      error.value = 'auth.two_factor.attempt_limit';
    } else if (code === 'TWO_FACTOR_NOT_ENABLED') {
      error.value = 'auth.two_factor.not_enabled';
    } else {
      error.value = 'auth.two_factor.sign_in_failed';
    }
    triggerShakeAnimation();
    totpCode.value = '';
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="space-y-1.5">
    <h1 id="two-factor-title" class="text-2xl font-semibold tracking-tight">
      {{ $t('auth.two_factor.title') }}
    </h1>
    <p id="two-factor-description" class="text-sm text-muted-foreground">
      <template v-if="useBackupCode">
        {{ t('auth.two_factor.backup_code_description') }}
      </template>
      <template v-else> {{ $t('auth.two_factor.authenticator_description') }} </template>
    </p>
  </div>

  <Alert v-if="error" id="two-factor-error" variant="destructive" role="alert">
    <AlertDescription>{{ t(error) }}</AlertDescription>
  </Alert>

  <form class="space-y-6" @submit.prevent="on2faSubmit">
    <Field v-if="useBackupCode" :data-invalid="!!error">
      <FieldLabel for="two-factor-code">{{ t('auth.two_factor.backup_code') }}</FieldLabel>
      <Input
        id="two-factor-code"
        :model-value="totpCode"
        autocomplete="one-time-code"
        autocapitalize="characters"
        :spellcheck="false"
        :disabled="isLoading"
        :aria-invalid="!!error"
        :aria-describedby="
          error ? 'two-factor-description two-factor-error' : 'two-factor-description'
        "
        @update:model-value="updateBackupCode"
      />
    </Field>
    <div v-else class="flex justify-center">
      <InputOTP
        id="two-factor-code"
        v-model="totpCode"
        :class="cn([{ animateShake: isShaking }, 'justify-center'])"
        aria-labelledby="two-factor-title"
        :aria-describedby="
          error ? 'two-factor-description two-factor-error' : 'two-factor-description'
        "
        :aria-invalid="!!error"
        :disabled="isLoading"
        placeholder="○"
        :maxlength="TOTP_LENGTH"
        :pattern="REGEXP_ONLY_DIGITS"
        @complete="on2faSubmit"
      >
        <InputOTPGroup>
          <InputOTPSlot
            v-for="(_, index) in TOTP_LENGTH"
            :key="index"
            :index="index"
            class="h-14 w-12 text-2xl"
          />
        </InputOTPGroup>
      </InputOTP>
    </div>
    <Button type="submit" class="w-full" :is-loading="isLoading" :disabled="!isCodeValid">
      {{ $t('auth.two_factor.verify') }}
    </Button>
    <Button
      type="button"
      variant="link"
      class="w-full"
      :disabled="isLoading"
      :aria-pressed="useBackupCode"
      aria-controls="two-factor-code"
      @click="toggleCodeMode"
    >
      {{
        t(useBackupCode ? 'auth.two_factor.use_authenticator' : 'auth.two_factor.use_backup_code')
      }}
    </Button>
    <Button
      type="button"
      variant="ghost"
      class="w-full"
      :disabled="isLoading"
      @click="emit('cancel')"
    >
      {{ $t('auth.back_to_sign_in') }}
    </Button>
  </form>
</template>
