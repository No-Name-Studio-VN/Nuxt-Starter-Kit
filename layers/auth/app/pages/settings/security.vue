<script setup lang="ts">
import SettingsNavigation from '#layers/auth/app/components/settings/SettingsNavigation.vue';
import { useSettingsProfile } from '#layers/auth/app/composables/useSettingsProfile';

definePageMeta({
  title: 'settings.security_page_title',
  breadcrumb: 'settings.security_breadcrumb',
  preferredLayout: 'dashboard',
  middleware: ['auth'],
  fullWidth: false,
});

const { t } = useI18n();
useSeoMeta({ title: () => t('settings.security_page_title'), robots: 'noindex, nofollow' });

const { data: profile, status, refresh } = useSettingsProfile();
</script>

<template>
  <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('settings.security_page_title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('settings.security_page_description') }}</p>
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
      <ClientOnly>
        <ExtensionSlot name="settings:security:sections" :profile="profile" :refresh="refresh" />
      </ClientOnly>
    </template>
    <div v-else-if="status !== 'error'" role="status">
      <span class="sr-only">{{ t('settings.profile_loading') }}</span>
      <Skeleton class="h-64 w-full" />
    </div>
  </div>
</template>
