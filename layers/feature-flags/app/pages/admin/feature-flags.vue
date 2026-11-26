<template>
  <div class="space-y-6">
    <AdminFeatureFlagsManager />
  </div>
</template>

<script setup lang="ts">
import AdminFeatureFlagsManager from '#layers/feature-flags/app/components/admin/feature-flags/AdminFeatureFlagsManager.vue';

definePageMeta({
  title: 'admin.flags.title',
  breadcrumb: 'admin.flags.title',
  middleware: ['auth', 'admin'],
});

const { t } = useI18n();
useSeoMeta({
  title: () => t('admin.flags.title'),
  description: () => t('admin.flags.description'),
});
</script>
