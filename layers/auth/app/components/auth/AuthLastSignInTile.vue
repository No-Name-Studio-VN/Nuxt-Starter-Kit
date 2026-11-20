<script setup lang="ts">
import { ChevronRight, Fingerprint, LoaderCircle, LockKeyhole } from '@lucide/vue';
import { usePreferredReducedMotion } from '@vueuse/core';
import { motion } from 'motion-v';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { LastSignInTileEmits, LastSignInTileProps } from '#layers/auth/types/lastSignIn';

const props = defineProps<LastSignInTileProps>();
const emit = defineEmits<LastSignInTileEmits>();

const { t } = useI18n();
const reducedMotion = usePreferredReducedMotion();
const initials = computed(() => props.record.name.split(/\s+/).slice(0, 2)
  .map((word) => Array.from(word)[0]).join('').toUpperCase());
const description = computed(() => {
  const { record, provider } = props;
  if (record.method === 'oauth' && provider) {
    return t('auth.last_sign_in_provider', { provider: provider.name });
  }
  const key = record.method === 'passkey' ? 'auth.passkey.last_sign_in' : 'auth.last_sign_in_password';
  return t(key, { username: record.username });
});
</script>

<template>
  <motion.div
    :initial="reducedMotion === 'reduce' ? false : { opacity: 0, y: 4 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ duration: reducedMotion === 'reduce' ? 0 : 0.2 }"
    class="flex min-h-52 flex-col gap-4"
  >
    <div class="flex flex-col gap-2">
      <p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {{ t('auth.last_sign_in_label') }}
      </p>
      <Button
        type="button"
        variant="outline"
        class="h-auto min-h-16 w-full justify-start gap-3 px-3 py-2.5 text-left motion-reduce:transition-none"
        data-last-sign-in-continue
        :aria-label="t('auth.last_sign_in_continue', { name: record.name, method: description })"
        :aria-busy="pending"
        :disabled="pending"
        @click="emit('continue')"
      >
        <span class="relative shrink-0" aria-hidden="true">
          <Avatar class="size-10 rounded-full border">
            <AvatarImage v-if="record.avatar" :src="record.avatar" alt="" class="object-cover" />
            <AvatarFallback>{{ initials }}</AvatarFallback>
          </Avatar>
          <span class="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border bg-background text-foreground">
            <span v-if="record.method === 'oauth' && provider" class="size-3">
              <OAuthIcon :icon="provider.icon" />
            </span>
            <Fingerprint v-else-if="record.method === 'passkey'" class="size-3" />
            <LockKeyhole v-else class="size-3" />
          </span>
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate font-semibold">{{ record.name }}</span>
          <span class="truncate text-xs font-normal text-muted-foreground">{{ description }}</span>
        </span>
        <LoaderCircle v-if="pending" class="text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />
        <ChevronRight v-else class="text-muted-foreground" aria-hidden="true" />
      </Button>
    </div>

    <Button
      type="button"
      variant="outline"
      class="h-10 w-full motion-reduce:transition-none"
      :disabled="pending"
      @click="emit('alternate')"
    >
      {{ t('auth.last_sign_in_alternate') }}
    </Button>

    <p class="mt-auto flex flex-wrap items-center justify-center gap-x-1 text-xs text-muted-foreground">
      {{ t('auth.last_sign_in_not_you') }}
      <Button
        type="button"
        variant="link"
        class="h-auto min-h-6 px-0 py-1 text-xs text-muted-foreground underline motion-reduce:transition-none"
        :disabled="pending"
        @click="emit('forget')"
      >
        {{ t('auth.last_sign_in_forget') }}
      </Button>
    </p>
  </motion.div>
</template>
