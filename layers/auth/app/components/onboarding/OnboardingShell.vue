<script setup lang="ts">
import { LogOutIcon } from '@lucide/vue';
import AuthBrand from '../auth/AuthBrand.vue';

defineProps<{ signingOut: boolean; disabled: boolean }>();
defineEmits<{ signOut: [] }>();

const { t } = useI18n();
const localePath = useLocalePath();
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background text-foreground">
    <header class="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
      <AuthBrand :to="localePath('/')" size="sm" class="min-w-0 self-center wrap-anywhere" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="shrink-0"
        :disabled="disabled || signingOut"
        @click="$emit('signOut')"
      >
        <Spinner v-if="signingOut" data-icon="inline-start" aria-hidden="true" />
        <LogOutIcon v-else data-icon="inline-start" aria-hidden="true" />
        {{ t('common.log_out') }}
      </Button>
    </header>

    <main class="flex flex-1 justify-center overflow-x-clip px-4 pt-[clamp(2rem,10svh,7rem)] pb-12 sm:pb-20">
      <div class="w-full min-w-0 max-w-120">
        <slot />
      </div>
    </main>
  </div>
</template>
