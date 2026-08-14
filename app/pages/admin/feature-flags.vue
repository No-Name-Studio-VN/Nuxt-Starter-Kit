<template>
  <div class="space-y-6">
    <AdminFeatureFlagsManager />
  </div>
</template>

<script setup lang="ts">
import AdminFeatureFlagsManager from '@/components/admin/feature-flags/AdminFeatureFlagsManager.vue';

definePageMeta({
  title: 'Feature Flags',
  breadcrumb: 'Feature Flags',
  middleware: ['auth', 'admin'],
});
</script>
