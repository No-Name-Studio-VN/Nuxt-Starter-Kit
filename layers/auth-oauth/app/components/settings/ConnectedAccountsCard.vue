<script setup lang="ts">
import { CheckCircle2, CircleAlert, Link2, Unlink, X } from '@lucide/vue';
import { useMounted } from '@vueuse/core';
import { motion, useReducedMotion } from 'motion-v';
import { toast } from 'vue-sonner';
import { formatDate } from '@/lib/utils';
import OAuthIcon from '#layers/auth-oauth/app/components/OAuthIcon.vue';
import SecurityCard from '#layers/auth/app/components/settings/SecurityCard.vue';
import SecurityRow from '#layers/auth/app/components/settings/SecurityRow.vue';
import { getQueryString } from '#layers/auth/app/utils/safeRedirect';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { OAUTH_PROVIDERS } from '#layers/auth-oauth/shared/constants/oauthProviders';
import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import { useOAuthPopup } from '#layers/auth-oauth/app/composables/useOAuthPopup';
import { useReadyOAuthProviderList } from '#layers/auth-oauth/app/composables/useReadyOAuthProviders';
import type { LinkedAccount, OAuthUnlinkPayload } from '#layers/auth-oauth/types/oauth';
import type { SettingsOAuthNotice } from '#layers/auth-oauth/types/settings';
import type { SettingsSectionProps } from '#layers/auth/types/settings';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const props = defineProps<SettingsSectionProps>();
const { t, te, locale } = useI18n();
const mounted = useMounted();
const route = useRoute();
const router = useRouter();
const reducedMotion = useReducedMotion();
const localePath = useAppLocalePath();
const { providers, status, refresh: refreshProviders } = useReadyOAuthProviderList();
const { data: accounts, status: accountsStatus, refresh: refreshAccounts } = useLazyAsyncData(
  () => `auth:oauth:accounts:${props.profile.id}`,
  async (_app, { signal }) => {
    const response = await apiRequest<ApiResponse<LinkedAccount[]>>(oauthRoutes.ACCOUNTS, { signal });
    if (!response.success) throw response;
    return response.data;
  },
  { server: false, default: () => [] },
);
const isLoading = computed(() => [status.value, accountsStatus.value].some((state) => state === 'pending' || state === 'idle'));
const loadFailed = computed(() => status.value === 'error' || accountsStatus.value === 'error');

async function refreshSettings() {
  await Promise.all([props.refresh(), refreshAccounts()]);
}

async function retryLoad() {
  await Promise.all([refreshProviders(), refreshAccounts()]);
}
const notice = ref<SettingsOAuthNotice | null>(null);
const unlinking = ref(false);
const providerToUnlink = ref<string>();
const methodCount = computed(() => Object.values(props.profile.signInMethods).reduce((sum, count) => sum + count, 0));

function canUnlink(provider: string) {
  return status.value === 'success' && (!providers.value.some((id) => id === provider) || methodCount.value > 1);
}

const rows = computed(() => [
  ...providers.value.map((id) => ({
    id,
    name: OAUTH_PROVIDERS[id].label,
    icon: OAUTH_PROVIDERS[id].icon,
    account: accounts.value.find((account) => account.provider === id),
  })),
  ...accounts.value.flatMap((account) => {
    if (providers.value.some((id) => id === account.provider)) return [];
    const display = Object.entries(OAUTH_PROVIDERS).find(([id]) => id === account.provider)?.[1];
    const icon = display?.icon ?? 'key-round';
    return [{ id: account.provider, name: display?.label ?? account.provider, icon, account }];
  }),
]);

function accountDescription(account: LinkedAccount | undefined) {
  if (!account) return t('settings.connected.not_connected');
  const parts = [account.email || account.name || t('settings.connected.linked')];
  const date = mounted.value ? formatDate(account.linkedAt, locale.value) : '';
  if (date) parts.push(t('settings.connected.linked_on', { date }));
  if (!canUnlink(account.provider) && status.value === 'success') parts.push(t('settings.connected.only_sign_in_note'));
  return parts.join(' · ');
}

function showResult(error: string, success: string, provider: string) {
  if (error) {
    const key = `settings.connected.callback.${error}`;
    notice.value = {
      variant: 'destructive',
      title: t('settings.connected.link_failed'),
      message: t(te(key) ? key : 'settings.connected.callback.oauth-error'),
    };
  } else if (success === 'oauth-linked' || success === 'oauth-unlinked') {
    const name = rows.value.find(({ id }) => id === provider)?.name;
    notice.value = {
      variant: 'success',
      title: t(`settings.connected.callback.${success}`),
      message: name && success === 'oauth-linked'
        ? t('settings.connected.linked_description', { provider: name })
        : t('settings.connected.updated_description'),
    };
    void refreshSettings();
  }
}

function onPopupComplete(target: URL, expectedProvider: string) {
  const provider = target.searchParams.get('provider');
  const error = target.searchParams.get('error') ?? '';
  const success = target.searchParams.get('success') ?? '';
  const matchesSettings = [authRoutes.SETTINGS_SECURITY, localePath(authRoutes.SETTINGS_SECURITY)].includes(target.pathname);
  // The provider handler returns generic OAuth failures to login, even from link mode.
  const linkFailure = [authRoutes.AUTH_LOGIN, localePath(authRoutes.AUTH_LOGIN)].some((path) => path === target.pathname) && error === 'oauth-error';
  if ((!matchesSettings && !linkFailure) || (provider && provider !== expectedProvider) || (!error && !success)) return false;

  showResult(error, success, provider ?? expectedProvider);
  return true;
}

const { activeProvider: linking, open: openLinkPopup, cancel: cancelLinkPopup } = useOAuthPopup({
  action: 'link',
  onComplete: onPopupComplete,
  onBlocked: () => toast.error(t('auth_oauth.popup_blocked')),
  onTimeout: () => toast.error(t('auth_oauth.popup_timed_out')),
  onError(error) {
    const { message } = parseApiError(error);
    toast.error(t(te(message) ? message : 'settings.connected.start_failed'));
  },
});

onMounted(() => {
  watch([() => route.query.error, () => route.query.success, () => route.query.provider], ([error, success, provider]) => {
    if (!error && !success) return;
    showResult(getQueryString(error), getQueryString(success), getQueryString(provider));
    const query = { ...route.query };
    delete query.error;
    delete query.success;
    delete query.provider;
    void router.replace({ query, hash: route.hash });
  }, { immediate: true });
});

function linkProvider(provider: string) {
  if (linking.value || unlinking.value) return;
  notice.value = null;
  const readyProvider = providers.value.find((id) => id === provider);
  if (readyProvider) return openLinkPopup(readyProvider, localePath(authRoutes.SETTINGS_SECURITY));
}

async function unlinkProvider() {
  const provider = providerToUnlink.value;
  if (!provider || linking.value || unlinking.value || !canUnlink(provider)) return;
  unlinking.value = true;
  notice.value = null;

  try {
    const response = await apiRequest<ApiResponse<OAuthUnlinkPayload>>(oauthRoutes.UNLINK, {
      method: 'DELETE',
      body: { provider },
    });
    if (!response.success) throw response;
    providerToUnlink.value = undefined;
    toast.success(t('settings.connected.callback.oauth-unlinked'));
    await refreshSettings();
  } catch (error) {
    const parsed = parseApiError(error);
    const key = parsed.code === 'ONLY_SIGNIN_METHOD' ? 'settings.connected.only_sign_in' : 'settings.connected.unlink_failed';
    toast.error(t(key));
    if (parsed.code === 'ONLY_SIGNIN_METHOD' || parsed.code === 'OAUTH_PROVIDER_NOT_LINKED') {
      providerToUnlink.value = undefined;
      await refreshSettings();
    }
  } finally {
    unlinking.value = false;
  }
}
</script>

<template>
  <SecurityCard
    :title="t('settings.connected.title')"
    :description="t('settings.connected.description')"
    :status="t('settings.connected.count', accounts.length)"
    :positive="accounts.length > 0"
  >
    <template #before>
      <motion.div
        v-if="notice"
        class="px-5 pt-3.5 pb-1"
        :initial="reducedMotion ? false : { opacity: 0, y: -4 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.18 }"
      >
        <Alert :variant="notice.variant" class="pr-12">
          <CheckCircle2 v-if="notice.variant === 'success'" aria-hidden="true" />
          <CircleAlert v-else aria-hidden="true" />
          <AlertTitle class="whitespace-normal">{{ notice.title }}</AlertTitle>
          <AlertDescription>{{ notice.message }}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="absolute right-2 top-2"
            :aria-label="t('settings.dismiss_notice')"
            @click="notice = null"
          >
            <X aria-hidden="true" />
          </Button>
        </Alert>
      </motion.div>

      <div v-if="loadFailed" class="px-5 py-3.5">
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {{ t('settings.connected.load_failed') }}
            <Button type="button" variant="outline" size="sm" @click="retryLoad()">
              {{ t('settings.retry') }}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
      <div v-else-if="isLoading" class="px-5 py-3.5" role="status">
        <span class="sr-only">{{ t('settings.connected.loading') }}</span>
        <Skeleton class="h-8 w-full motion-reduce:animate-none" />
      </div>
      <p v-else-if="!rows.length" class="px-5 py-3.5 text-sm text-muted-foreground">{{ t('settings.connected.empty') }}</p>
    </template>
    <SecurityRow
      v-for="row in rows"
      :key="row.id"
      :title="row.name"
      :description="accountDescription(row.account)"
    >
      <template #icon>
        <span class="size-4"><OAuthIcon :icon="row.icon" brand-colors /></span>
      </template>
      <template #actions>
        <AlertDialog
          v-if="row.account"
          :open="providerToUnlink === row.id"
          @update:open="(open) => { if (!unlinking) providerToUnlink = open ? row.id : undefined; }"
        >
          <AlertDialogTrigger as-child>
            <Button
              type="button"
              variant="outline"
              :disabled="!canUnlink(row.id) || !!linking || unlinking"
              :aria-label="t('settings.connected.unlink_provider', { provider: row.name })"
            >
              <Unlink aria-hidden="true" />
              {{ t('settings.connected.unlink') }}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{{ t('settings.connected.unlink_title') }}</AlertDialogTitle>
              <AlertDialogDescription>
                {{ t('settings.connected.unlink_description', { provider: row.name }) }}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel :disabled="unlinking">{{ t('settings.cancel') }}</AlertDialogCancel>
              <Button type="button" variant="destructive" :disabled="unlinking || !canUnlink(row.id)" @click="unlinkProvider">
                <Spinner v-if="unlinking" aria-hidden="true" />
                {{ t('settings.connected.unlink') }}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <template v-else>
          <Button
            type="button"
            variant="outline"
            :disabled="!!linking || unlinking || isLoading || accountsStatus === 'error'"
            :aria-label="t('settings.connected.link_provider', { provider: row.name })"
            @click="linkProvider(row.id)"
          >
            <Spinner v-if="linking === row.id" aria-hidden="true" />
            <Link2 v-else aria-hidden="true" />
            {{ t(linking === row.id ? 'settings.connected.linking' : 'settings.connected.link') }}
          </Button>
          <Button v-if="linking === row.id" type="button" variant="ghost" size="sm" @click="cancelLinkPopup()">
            {{ t('settings.cancel') }}
          </Button>
        </template>
      </template>
    </SecurityRow>
  </SecurityCard>
</template>
