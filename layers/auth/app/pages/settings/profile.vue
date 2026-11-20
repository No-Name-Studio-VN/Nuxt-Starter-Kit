<script setup lang="ts">
import SettingsNavigation from '#layers/auth/app/components/settings/SettingsNavigation.vue';
import { useSettingsProfile } from '#layers/auth/app/composables/useSettingsProfile';
import DeleteAccountCard from '#layers/auth/app/components/settings/DeleteAccountCard.vue';
import ProfileCard from '#layers/auth/app/components/settings/ProfileCard.vue';

definePageMeta({
  title: 'account_page.title',
  breadcrumb: 'account_page.breadcrumb',
  preferredLayout: 'dashboard',
  middleware: ['auth'],
  fullWidth: false,
});

const { t } = useI18n();
useSeoMeta({ title: () => t('account_page.title'), robots: 'noindex, nofollow' });

const { data: profile, status, refresh } = useSettingsProfile();
</script>

<template>
  <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('account_page.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('account_page.description') }}</p>
    </header>

    <SettingsNavigation />

    <Alert v-if="status === 'error'" variant="destructive" role="alert">
      <AlertTitle>{{ t('settings.profile_load_failed') }}</AlertTitle>
      <AlertDescription>
        <Button type="button" variant="outline" size="sm" @click="refresh()">
          {{ t('settings.retry') }}
        </Button>
      </AlertDescription>
    </Alert>

    <template v-if="profile">
      <ProfileCard :profile="profile" :refresh="refresh" />
      <DeleteAccountCard :profile="profile" :refresh="refresh" />
    </template>
    <div v-else-if="status !== 'error'" role="status">
      <span class="sr-only">{{ t('settings.profile_loading') }}</span>
      <Skeleton class="h-64 w-full" />
    </div>
  </div>
</template>
