<script setup lang="ts">
import { ArrowRightIcon, AtSignIcon, CheckIcon } from '@lucide/vue';
import { Field as VeeField, useForm } from 'vee-validate';
import { useUsernameAvailability } from '#layers/auth/app/composables/useUsernameAvailability';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { updateUsernameSchema } from '#layers/auth/shared/schemas/userSchema';
import type { ProfileUpdateData } from '#layers/auth/types/models/profile';
import type { OnboardingStepEmits, OnboardingStepProps } from '#layers/auth/types/onboarding';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import type { ApiResponse } from '#layers/server-core/types/api';

const props = defineProps<OnboardingStepProps>();
const emit = defineEmits<OnboardingStepEmits>();
const { t, te } = useI18n();
const { fetch: refreshSession } = useUserSession();

const savedUsername = ref(props.user.username);
const { values, handleSubmit, isSubmitting, setFieldError } = useForm({
  initialValues: { username: savedUsername.value },
  validationSchema: updateUsernameSchema,
});
const { candidate, availability, retry } = useUsernameAvailability(
  () => values.username,
  () => savedUsername.value,
);
const saveError = ref(false);

function selectUsername(event: FocusEvent) {
  if (event.target instanceof HTMLInputElement) event.target.select();
}

watch(candidate, () => {
  saveError.value = false;
});

function retryAvailability() {
  saveError.value = false;
  retry();
}

const submit = handleSubmit(async ({ username }) => {
  if (availability.value !== 'available' || candidate.value !== username) return;
  saveError.value = false;

  try {
    if (username !== savedUsername.value) {
      const response = await apiRequest<ApiResponse<ProfileUpdateData>>(
        authRoutes.userUsername('me'),
        {
          method: 'PATCH',
          body: { username },
        },
      );
      if (!response.success) throw response.error;
      savedUsername.value = response.data.username;
      await refreshSession();
    }
    emit('done');
  } catch (error) {
    const parsed = parseApiError(error);
    const fieldMessage = parsed.fieldErrors.username?.[0];
    if (parsed.code === 'USERNAME_TAKEN' || fieldMessage === 'auth.username_taken') {
      availability.value = 'taken';
      setFieldError('username', 'auth.username_taken');
    } else if (fieldMessage && te(fieldMessage)) {
      setFieldError('username', fieldMessage);
    } else {
      saveError.value = true;
    }
  }
});
</script>

<template>
  <div class="flex flex-col gap-7">
    <header class="flex flex-col gap-2">
      <div
        class="mb-2 grid size-10 place-items-center rounded-md border bg-muted/50"
        aria-hidden="true"
      >
        <AtSignIcon class="size-5" />
      </div>
      <h1 class="text-3xl font-semibold tracking-tight outline-none sm:text-4xl" tabindex="-1">
        {{ t('onboarding.username.title') }}
      </h1>
      <p class="text-sm leading-relaxed text-pretty text-muted-foreground">
        {{ t('onboarding.username.description') }}
      </p>
    </header>

    <form @submit="submit">
      <FieldGroup class="gap-5">
        <VeeField v-slot="{ field, errors }" name="username">
          <Field
            :data-invalid="
              availability === 'taken' || availability === 'invalid' || !!errors.length
            "
          >
            <FieldLabel for="onboarding-username">{{ t('onboarding.username.label') }}</FieldLabel>
            <Input
              id="onboarding-username"
              :model-value="field.value"
              type="text"
              autocomplete="username"
              autocapitalize="none"
              :spellcheck="false"
              :disabled="isSubmitting"
              :aria-invalid="
                availability === 'taken' || availability === 'invalid' || !!errors.length
              "
              aria-describedby="onboarding-username-status"
              class="h-12 text-base md:text-base"
              @focus.once="selectUsername"
              @update:model-value="field.onChange"
            />
            <div
              id="onboarding-username-status"
              class="flex min-h-6 items-center gap-2"
              aria-live="polite"
              aria-atomic="true"
            >
              <FieldError v-if="availability === 'taken'">{{
                t('auth.username_taken')
              }}</FieldError>
              <FieldError v-else-if="availability === 'invalid'">{{
                t('onboarding.username.invalid')
              }}</FieldError>
              <FieldError
                v-else-if="errors.length"
                :errors="errors.map((key) => t(te(key) ? key : 'onboarding.username.invalid'))"
              />
              <FieldDescription v-else class="flex items-center gap-2">
                <Spinner v-if="availability === 'checking'" aria-hidden="true" />
                <CheckIcon
                  v-else-if="availability === 'available'"
                  class="size-4"
                  aria-hidden="true"
                />
                {{ t(`onboarding.username.${availability}`) }}
              </FieldDescription>
              <Button
                v-if="availability === 'failed'"
                type="button"
                variant="link"
                size="sm"
                class="h-auto shrink-0 px-1 py-0.5"
                @click="retryAvailability"
              >
                {{ t('onboarding.retry') }}
              </Button>
            </div>
          </Field>
        </VeeField>
        <FieldError v-if="saveError" role="alert">{{
          t('onboarding.username.save_failed')
        }}</FieldError>
        <Button
          type="submit"
          class="h-11 w-full"
          :disabled="availability !== 'available' || isSubmitting"
        >
          <Spinner v-if="isSubmitting" data-icon="inline-start" aria-hidden="true" />
          {{ t('onboarding.continue') }}
          <ArrowRightIcon v-if="!isSubmitting" data-icon="inline-end" aria-hidden="true" />
        </Button>
      </FieldGroup>
    </form>
  </div>
</template>
