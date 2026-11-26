<template>
  <div class="flex flex-col gap-6">
    <AdminKvManager />
  </div>
</template>

<script setup lang="ts">
import AdminKvManager from '#layers/admin-kv/app/components/admin/kv/AdminKvManager.vue';

definePageMeta({
  title: 'admin.kv.title',
  breadcrumb: 'admin.kv.title',
  middleware: ['auth', 'admin'],
});

const { t } = useI18n();
useSeoMeta({ title: () => t('admin.kv.title'), description: () => t('admin.kv.description') });
</script>
