<script setup lang="ts">
import { ArrowRightIcon, ShieldCheckIcon, UserRoundIcon } from '@lucide/vue';
import { motion, useReducedMotion } from 'motion-v';
import WelcomeActionCard from './WelcomeActionCard.vue';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import type { SessionUser } from '#layers/auth/types/auth';

const props = defineProps<{ user: SessionUser; busy: boolean; dashboardAvailable: boolean }>();
const emit = defineEmits<{ complete: [destination?: string] }>();

const { t } = useI18n();
const reduceMotion = useReducedMotion();
const actions = [
  {
    icon: ShieldCheckIcon,
    title: 'onboarding.secure_account.title',
    description: 'onboarding.secure_account.description',
    destination: authRoutes.SETTINGS_SECURITY,
  },
  {
    icon: UserRoundIcon,
    title: 'onboarding.review_profile.title',
    description: 'onboarding.review_profile.description',
    destination: authRoutes.SETTINGS_PROFILE,
  },
];
const displayName = computed(() => props.user.name.trim() || props.user.username);
const initials = computed(() => displayName.value.split(/\s+/).slice(0, 2)
  .map((word) => Array.from(word)[0] ?? '').join('').toLocaleUpperCase());
</script>

<template>
  <div class="flex flex-col gap-7">
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="relative mb-1 grid size-28 place-items-center rounded-full border border-dashed border-border" aria-hidden="true">
        <div class="grid size-23 place-items-center rounded-full border bg-muted/40">
          <Avatar class="size-18">
            <AvatarFallback class="bg-primary/12 text-2xl font-semibold text-foreground">
              {{ initials }}
            </AvatarFallback>
          </Avatar>
        </div>
        <motion.div
          class="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full border-3 border-background bg-primary text-primary-foreground"
          :initial="reduceMotion ? false : { scale: 0.75, opacity: 0 }"
          :animate="{ scale: 1, opacity: 1 }"
          :transition="{ delay: 0.14, duration: 0.25, ease: 'easeOut' }"
        >
          <svg viewBox="0 0 24 24" fill="none" class="size-4">
            <motion.path
              d="m5 12 4 4L19 6"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              :initial="reduceMotion ? false : { pathLength: 0 }"
              :animate="{ pathLength: 1 }"
              :transition="{ delay: 0.24, duration: 0.23, ease: 'easeOut' }"
            />
          </svg>
        </motion.div>
      </div>
      <div class="flex w-full flex-col gap-2">
        <h1 class="text-3xl font-semibold tracking-tight break-words outline-none sm:text-4xl" tabindex="-1">
          {{ t('onboarding.welcome.title', { name: displayName }) }}
        </h1>
        <p class="mx-auto max-w-84 text-sm leading-relaxed text-pretty text-muted-foreground">
          {{ t(dashboardAvailable ? 'onboarding.welcome.description' : 'onboarding.welcome.description_without_dashboard') }}
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-2.5">
      <h2 class="text-sm font-medium">{{ t('onboarding.welcome.next_steps') }}</h2>
      <ul class="flex flex-col gap-2">
        <motion.li
          v-for="(action, index) in actions"
          :key="action.destination"
          :initial="reduceMotion ? false : { opacity: 0, y: 8 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.24, delay: 0.17 + index * 0.06, ease: 'easeOut' }"
        >
          <WelcomeActionCard
            :title="t(action.title)"
            :description="t(action.description)"
            :disabled="busy"
            @select="emit('complete', action.destination)"
          >
            <component :is="action.icon" />
          </WelcomeActionCard>
        </motion.li>
      </ul>
    </div>

    <Button type="button" class="h-11 w-full" :disabled="busy" @click="emit('complete')">
      <Spinner v-if="busy" data-icon="inline-start" aria-hidden="true" />
      {{ t(dashboardAvailable ? 'onboarding.welcome.dashboard' : 'onboarding.welcome.home') }}
      <ArrowRightIcon v-if="!busy" data-icon="inline-end" aria-hidden="true" />
    </Button>
  </div>
</template>
