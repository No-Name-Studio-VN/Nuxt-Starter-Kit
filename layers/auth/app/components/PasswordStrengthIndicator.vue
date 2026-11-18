<script setup lang="ts">
import { computed } from 'vue';
import { Progress } from '@/components/ui/progress';
import { Check } from '@lucide/vue';
import type { PasswordStrength } from '#layers/auth/types/password';

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

const progressValue = computed(() => props.strength.score);

// Short labels keep the checklist to one or two lines so auth forms fit without scrolling.
const checkItems = computed(() => [
  { id: 'length', label: '8+ chars', passed: props.strength.checks.length },
  { id: 'uppercase', label: 'Uppercase', passed: props.strength.checks.uppercase },
  { id: 'lowercase', label: 'Lowercase', passed: props.strength.checks.lowercase },
  { id: 'number', label: 'Number', passed: props.strength.checks.number },
  { id: 'special', label: 'Symbol', passed: props.strength.checks.special },
]);
</script>

<template>
  <div v-if="password" class="space-y-2">
    <div class="flex items-center gap-3">
      <Progress
        :model-value="progressValue"
        class="h-1 flex-1 transition-all duration-300"
        :style="{ '--progress-color': strength.color }"
        :aria-label="`Password strength ${strength.score}%`"
      />
      <span
        class="shrink-0 text-xs font-medium transition-colors duration-300"
        :style="{ color: strength.color }"
        aria-live="polite"
      >
        {{ strength.feedback }}
      </span>
    </div>

    <ul
      v-if="showDetails"
      class="flex flex-wrap gap-x-3 gap-y-1 text-xs"
      aria-label="Password requirements"
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
        <span class="sr-only">{{ item.passed ? '(met)' : '(not met)' }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
:deep([data-slot='progress-indicator']) {
  background-color: var(--progress-color, var(--primary));
}
</style>
