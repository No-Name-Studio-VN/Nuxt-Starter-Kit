<script setup lang="ts">
import { ArrowRightIcon, LaptopIcon, MoonIcon, SlidersHorizontalIcon, SunIcon } from '@lucide/vue';
import type { OnboardingStepEmits, OnboardingStepProps } from '#layers/auth/types/onboarding';
import { languageNames } from '~~/i18n-constants';

defineProps<OnboardingStepProps>();
const emit = defineEmits<OnboardingStepEmits>();
const { t, locale, setLocale } = useI18n();
const colorMode = useColorMode();
const switchingLocale = ref(false);
const localeError = ref(false);

const themes = [
  { value: 'light', icon: SunIcon, preview: '#fafafa', foreground: '#404040' },
  { value: 'dark', icon: MoonIcon, preview: '#262626', foreground: '#d4d4d4' },
  { value: 'system', icon: LaptopIcon, preview: 'linear-gradient(to right, #fafafa 50%, #262626 50%) no-repeat border-box', foreground: 'var(--foreground)' },
];

function changeTheme(value: unknown) {
  if (value === 'light' || value === 'dark' || value === 'system') colorMode.preference = value;
}

async function changeLocale(event?: Event) {
  const select = event?.target;
  if (!(select instanceof HTMLSelectElement)) return;
  const value = select.value;
  if ((value !== 'en' && value !== 'vi') || value === locale.value || switchingLocale.value) return;

  switchingLocale.value = true;
  localeError.value = false;
  try {
    await setLocale(value);
  } catch {
    select.value = locale.value;
    localeError.value = true;
  } finally {
    switchingLocale.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-7">
    <header class="flex flex-col gap-2">
      <div class="mb-2 grid size-10 place-items-center rounded-md border bg-muted/50" aria-hidden="true">
        <SlidersHorizontalIcon class="size-5" />
      </div>
      <h1 class="text-3xl font-semibold tracking-tight outline-none sm:text-4xl" tabindex="-1">
        {{ t('onboarding.preferences.title') }}
      </h1>
      <p class="text-sm leading-relaxed text-pretty text-muted-foreground">
        {{ t('onboarding.preferences.description') }}
      </p>
    </header>

    <form @submit.prevent="emit('done')">
      <FieldGroup class="gap-6">
        <FieldSet class="gap-3" :disabled="switchingLocale">
          <FieldLegend id="onboarding-theme-label" variant="label">{{ t('onboarding.preferences.theme') }}</FieldLegend>
          <RadioGroup
            :model-value="colorMode.preference"
            aria-labelledby="onboarding-theme-label"
            class="grid-cols-3 gap-2 sm:gap-3"
            @update:model-value="changeTheme"
          >
            <label
              v-for="theme in themes"
              :key="theme.value"
              class="flex min-w-0 cursor-pointer flex-col gap-2 rounded-md border p-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[[data-state=checked]]:border-primary sm:p-2"
            >
              <!-- Literal colors here represent the theme choices, not the wizard's theme. -->
              <span
                class="flex h-12 items-center justify-center rounded-sm border sm:h-14"
                :style="{ background: theme.preview, color: theme.foreground }"
                aria-hidden="true"
              >
                <span class="grid size-8 place-items-center rounded-md" :class="{ 'border bg-background': theme.value === 'system' }">
                  <component :is="theme.icon" class="size-5" />
                </span>
              </span>
              <span class="flex min-w-0 items-center gap-1.5 px-0.5 pb-0.5 text-xs sm:text-sm">
                <RadioGroupItem :value="theme.value" class="shrink-0" />
                <span class="min-w-0 wrap-break-word">{{ t(`onboarding.preferences.${theme.value}`) }}</span>
              </span>
            </label>
          </RadioGroup>
        </FieldSet>

        <Field :data-invalid="localeError">
          <FieldLabel for="onboarding-language">{{ t('onboarding.preferences.language') }}</FieldLabel>
          <NativeSelect
            id="onboarding-language"
            :model-value="locale"
            :disabled="switchingLocale"
            :aria-invalid="localeError"
            :aria-describedby="localeError ? 'onboarding-language-error' : undefined"
            class="h-10"
            @change="changeLocale"
          >
            <NativeSelectOption value="vi" lang="vi">{{ languageNames.vi }}</NativeSelectOption>
            <NativeSelectOption value="en" lang="en">{{ languageNames.en }}</NativeSelectOption>
          </NativeSelect>
          <FieldError v-if="localeError" id="onboarding-language-error" role="alert">
            {{ t('onboarding.preferences.language_failed') }}
          </FieldError>
        </Field>

        <Button type="submit" class="h-11 w-full" :disabled="switchingLocale">
          <Spinner v-if="switchingLocale" data-icon="inline-start" aria-hidden="true" />
          {{ t('onboarding.continue') }}
          <ArrowRightIcon v-if="!switchingLocale" data-icon="inline-end" aria-hidden="true" />
        </Button>
      </FieldGroup>
    </form>
  </div>
</template>
