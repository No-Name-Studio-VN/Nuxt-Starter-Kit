<script setup lang="ts">
import { REGEXP_ONLY_DIGITS } from 'vue-input-otp';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp';
import { TOTP_LENGTH } from '#layers/auth-2fa/shared/constants/totp';
import { twoFactorRoutes } from '#layers/auth-2fa/shared/twoFactorRoutes';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { cn } from '@/lib/utils';
import type { ApiResponse } from '#layers/server-core/types/api';
import type { LoginStepEmits, LoginStepProps } from '#layers/auth/types/loginSteps';

const props = defineProps<LoginStepProps>();
const emit = defineEmits<LoginStepEmits>();

const totpCode = ref('');
const isLoading = ref(false);
const error = ref('');
const isShaking = ref(false);

function triggerShakeAnimation() {
  isShaking.value = true;
  setTimeout(() => {
    isShaking.value = false;
  }, 600);
}

const on2faSubmit = async () => {
  if (totpCode.value.length !== TOTP_LENGTH) return;
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
  } catch (err: unknown) {
    error.value = parseApiError(err, 'Invalid authenticator code').message;
    triggerShakeAnimation();
    totpCode.value = '';
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="space-y-1">
    <h1 id="two-factor-title" class="text-2xl font-bold tracking-tight">
      Two-factor authentication
    </h1>
    <p id="two-factor-description" class="text-base text-muted-foreground">
      Enter the code from your authenticator app.
    </p>
  </div>

  <Alert v-if="error" variant="destructive">
    <AlertDescription>{{ error }}</AlertDescription>
  </Alert>

  <form class="space-y-6" @submit.prevent="on2faSubmit">
    <div class="flex justify-center">
      <InputOTP
        v-model="totpCode"
        :class="cn([{ animateShake: isShaking }, 'justify-center'])"
        aria-labelledby="two-factor-title"
        aria-describedby="two-factor-description"
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
    <Button
      type="submit"
      class="w-full"
      :is-loading="isLoading"
      :disabled="totpCode.length !== TOTP_LENGTH"
    >
      Verify Code
    </Button>
    <Button type="button" variant="ghost" class="w-full" @click="emit('cancel')">
      Back to login
    </Button>
  </form>
</template>
