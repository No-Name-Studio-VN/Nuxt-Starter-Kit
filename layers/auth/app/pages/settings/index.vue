<script setup lang="ts">
import { authRoutes } from '#layers/auth/shared/authRoutes';

definePageMeta({
  title: 'settings.page_title',
  breadcrumb: 'settings.breadcrumb',
  preferredLayout: 'dashboard',
  middleware: ['auth'],
});

const localePath = useAppLocalePath();
await navigateTo(localePath(authRoutes.SETTINGS_PROFILE), { replace: true });
</script>

<template>
  <div />
</template>
