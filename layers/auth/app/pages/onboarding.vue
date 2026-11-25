<script setup lang="ts">
import { ArrowLeftIcon } from '@lucide/vue';
import { AnimatePresence, motion, useReducedMotion } from 'motion-v';
import OnboardingProgress from '../components/onboarding/OnboardingProgress.vue';
import OnboardingShell from '../components/onboarding/OnboardingShell.vue';
import WelcomeScreen from '../components/onboarding/WelcomeScreen.vue';
import { safeRedirectPath } from '../utils/safeRedirect';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import type {
  OnboardingCompleteData,
  OnboardingStatusData,
  OnboardingStepsData,
} from '#layers/auth/types/onboarding';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import type { ApiResponse } from '#layers/server-core/types/api';

definePageMeta({ layout: false, key: 'onboarding' });

const { t } = useI18n();
const localePath = useAppLocalePath();
const dashboardAvailable = useRouter()
  .getRoutes()
  .some((record) => record.path === '/dashboard');
const { user, fetch: refreshSession, clear } = useUserSession();
const reduceMotion = useReducedMotion();
const stage = useTemplateRef('stage');

useSeoMeta({ title: () => t('onboarding.title'), robots: 'noindex, nofollow' });

const stepEntries = computed(
  () => new Map(getExtensions('onboarding:steps').map((entry) => [entry.id, entry])),
);
const stepIds = ref<string[]>([]);
const stepIndex = ref(0);
const visitedCount = ref(0);
const activeStep = computed(() => stepEntries.value.get(stepIds.value[stepIndex.value] ?? ''));
const screenKey = computed(() => (activeStep.value ? `step:${activeStep.value.id}` : 'welcome'));
const direction = ref(1);
const variants = {
  enter: (dir: number) => (reduceMotion.value ? { opacity: 0 } : { opacity: 0, x: dir * 22 }),
  visible: () => (reduceMotion.value ? { opacity: 1 } : { opacity: 1, x: 0 }),
  exit: (dir: number) => (reduceMotion.value ? { opacity: 0 } : { opacity: 0, x: dir * -22 }),
};

const status = ref<'loading' | 'ready' | 'failed'>('loading');
const saving = ref(false);
const finishing = ref(false);
const signingOut = ref(false);
const errorKey = ref('');
const transitioning = ref(false);
const backDisabled = computed(
  () => saving.value || finishing.value || signingOut.value || transitioning.value,
);

function registeredSteps(ids: string[]) {
  return ids.filter((id) => {
    if (stepEntries.value.has(id)) return true;
    if (import.meta.dev)
      console.warn(`Onboarding step "${id}" has no registered client component; skipping it.`);
    return false;
  });
}

async function loadStatus() {
  status.value = 'loading';
  transitioning.value = false;
  errorKey.value = '';
  try {
    const response = await apiRequest<ApiResponse<OnboardingStatusData>>(
      authRoutes.ONBOARDING_STATUS,
    );
    if (!response.success) throw response.error;
    if (!response.data.pending) {
      await refreshSession();
      await navigateTo(localePath('/'), { replace: true });
      return;
    }

    stepIds.value = registeredSteps(response.data.steps);
    stepIndex.value = 0;
    visitedCount.value = 0;
    status.value = 'ready';
  } catch (error) {
    if (parseApiError(error).status === 401) {
      await refreshSession();
      if (!user.value) {
        await navigateTo(localePath('/'), { replace: true });
        return;
      }
    }
    status.value = 'failed';
  }
}

onMounted(loadStatus);

async function onScreenAnimationComplete(definition: string | object | undefined) {
  if (definition !== 'visible') return;
  transitioning.value = false;
  await nextTick();
  const panel = stage.value?.querySelector<HTMLElement>('[data-onboarding-screen]');
  if (panel?.contains(document.activeElement)) return;
  const heading = panel?.querySelector<HTMLElement>('h1, h2, [role="heading"]');
  if (heading) heading.tabIndex = -1;
  (heading ?? panel)?.focus();
}

function goBack() {
  if (stepIndex.value === 0 || backDisabled.value) return;
  transitioning.value = true;
  direction.value = -1;
  errorKey.value = '';
  stepIndex.value--;
}

async function completeStep(stepId: string | undefined) {
  if (!stepId || backDisabled.value || stepId !== activeStep.value?.id) return;
  saving.value = true;
  errorKey.value = '';
  try {
    const response = await apiRequest<ApiResponse<OnboardingStepsData>>(
      authRoutes.onboardingStep(stepId),
      {
        method: 'POST',
      },
    );
    if (!response.success) throw response.error;

    // Completed steps disappear from the API, but remain available to Back in this visit.
    visitedCount.value = Math.max(visitedCount.value, stepIndex.value + 1);
    const visited = stepIds.value.slice(0, visitedCount.value);
    stepIds.value = [
      ...visited,
      ...registeredSteps(response.data.steps).filter((id) => !visited.includes(id)),
    ];
    transitioning.value = true;
    direction.value = 1;
    stepIndex.value++;
  } catch (error) {
    if (parseApiError(error).code === 'ONBOARDING_STEP_INVALID') {
      await loadStatus();
    } else {
      errorKey.value = 'onboarding.step_failed';
    }
  } finally {
    saving.value = false;
  }
}

async function complete(destination = dashboardAvailable ? '/dashboard' : '/') {
  if (backDisabled.value) return;
  finishing.value = true;
  errorKey.value = '';
  try {
    const response = await apiRequest<ApiResponse<OnboardingCompleteData>>(
      authRoutes.ONBOARDING_COMPLETE,
      {
        method: 'POST',
      },
    );
    if (!response.success) throw response.error;

    await refreshSession();
    await navigateTo(localePath(safeRedirectPath(destination)), { replace: true });
  } catch {
    errorKey.value = 'onboarding.complete_failed';
  } finally {
    finishing.value = false;
  }
}

async function signOut() {
  if (signingOut.value || saving.value || finishing.value) return;
  signingOut.value = true;
  errorKey.value = '';
  try {
    await clear();
    await navigateTo(localePath(authRoutes.AUTH_LOGIN), { replace: true });
  } catch {
    errorKey.value = 'onboarding.sign_out_failed';
  } finally {
    signingOut.value = false;
  }
}
</script>

<template>
  <OnboardingShell
    :signing-out="signingOut"
    :disabled="status === 'loading' || saving || finishing"
    @sign-out="signOut"
  >
    <div v-if="status === 'loading'" class="flex flex-col gap-8" role="status">
      <span class="sr-only">{{ t('onboarding.loading') }}</span>
      <div class="flex flex-col gap-2.5" aria-hidden="true">
        <div class="flex h-8 items-center"><Skeleton class="h-3 w-18" /></div>
        <Skeleton class="h-1 w-full" />
      </div>
      <div class="flex flex-col gap-3" aria-hidden="true">
        <Skeleton class="size-10" />
        <Skeleton class="h-9 w-4/5" />
        <Skeleton class="h-4 w-3/5" />
      </div>
    </div>

    <Alert v-else-if="status === 'failed'" variant="destructive" role="alert">
      <AlertTitle>{{ t('onboarding.load_failed') }}</AlertTitle>
      <AlertDescription>
        <Button type="button" variant="outline" size="sm" class="mt-2" @click="loadStatus">
          {{ t('onboarding.retry') }}
        </Button>
      </AlertDescription>
    </Alert>

    <div v-else-if="user" class="flex flex-col gap-8 sm:gap-10">
      <OnboardingProgress :current="stepIndex + 1" :total="stepIds.length + 1">
        <Button
          v-if="stepIndex > 0"
          variant="ghost"
          type="button"
          size="sm"
          class="-mr-1"
          :disabled="backDisabled"
          @click="goBack"
        >
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          {{ t('common.back') }}
        </Button>
      </OnboardingProgress>

      <div
        ref="stage"
        class="min-w-0"
        :inert="transitioning"
        :aria-busy="saving || finishing || transitioning"
      >
        <AnimatePresence mode="wait" :custom="direction">
          <motion.div
            :key="screenKey"
            data-onboarding-screen
            :variants="variants"
            :custom="direction"
            initial="enter"
            animate="visible"
            exit="exit"
            :transition="{ duration: 0.25, ease: 'easeOut' }"
            :on-animation-complete="onScreenAnimationComplete"
            class="min-w-0 outline-none"
            tabindex="-1"
          >
            <div v-if="activeStep" :inert="saving || signingOut">
              <component
                :is="activeStep.component"
                :user="user"
                @done="completeStep(activeStep?.id)"
                @back="goBack"
              />
            </div>
            <WelcomeScreen
              v-else
              :dashboard-available="dashboardAvailable"
              :user="user"
              :busy="finishing || signingOut"
              @complete="complete"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>

    <Alert v-if="errorKey" variant="destructive" class="mt-4" role="alert">
      <AlertDescription>{{ t(errorKey) }}</AlertDescription>
    </Alert>
  </OnboardingShell>
</template>
