<script setup lang="ts">
import { computed } from 'vue';
import { Progress } from '@/components/ui/progress';
import { Check } from '@lucide/vue';
import type { PasswordStrength } from '#layers/auth-password/types/password';

const props = withDefaults(
  defineProps<{
    password: string;
    strength: PasswordStrength;
    showDetails?: boolean;
  }>(),
  {
    showDetails: true,
  },
);

const { t } = useI18n();
const progressValue = computed(() => props.strength.score);

// Short labels keep the checklist to one or two lines so auth forms fit without scrolling.
const checkItems = computed(() => [
  { id: 'length', label: t('auth_password.strength.length'), passed: props.strength.checks.length },
  {
    id: 'uppercase',
    label: t('auth_password.strength.uppercase'),
    passed: props.strength.checks.uppercase,
  },
  {
    id: 'lowercase',
    label: t('auth_password.strength.lowercase'),
    passed: props.strength.checks.lowercase,
  },
  { id: 'number', label: t('auth_password.strength.number'), passed: props.strength.checks.number },
  {
    id: 'special',
    label: t('auth_password.strength.special'),
    passed: props.strength.checks.special,
  },
]);
</script>

<template>
  <div v-if="password" class="space-y-2">
    <div class="flex items-center gap-3">
      <Progress
        :model-value="progressValue"
        class="h-1 flex-1 transition-all duration-300"
        :style="{ '--progress-color': strength.color }"
        :aria-label="t('auth_password.strength.label', { score: strength.score })"
      />
      <span
        class="shrink-0 text-xs font-medium transition-colors duration-300"
        :style="{ color: strength.color }"
        aria-live="polite"
      >
        {{ t(`auth_password.strength.${strength.level}`) }}
      </span>
    </div>

    <ul
      v-if="showDetails"
      class="flex flex-wrap gap-x-3 gap-y-1 text-xs"
      :aria-label="$t('settings.password.requirements')"
    >
      <li
        v-for="item in checkItems"
        :key="item.id"
        class="flex items-center gap-1 transition-colors duration-200"
        :class="item.passed ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'"
      >
        <Check v-if="item.passed" aria-hidden="true" class="size-3 shrink-0" />
        <span v-else aria-hidden="true" class="size-1 shrink-0 rounded-full bg-current mx-1" />
        <span>{{ item.label }}</span>
        <span class="sr-only">{{
          t(item.passed ? 'auth_password.strength.met' : 'auth_password.strength.not_met')
        }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
:deep([data-slot='progress-indicator']) {
  background-color: var(--progress-color, var(--primary));
}
</style>
