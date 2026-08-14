<template>
  <div class="flex flex-col gap-6">
    <AdminKvManager />
  </div>
</template>

<script setup lang="ts">
import AdminKvManager from '@/components/admin/kv/AdminKvManager.vue';

definePageMeta({
  title: 'KV Store',
  breadcrumb: 'KV Store',
  middleware: ['auth', 'admin'],
});
</script>
