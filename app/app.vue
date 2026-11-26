<template>
  <Toaster position="top-center" />
  <ExtensionSlot name="app:root" />
  <NuxtLoadingIndicator :color="false" class="z-100 bg-primary/80" />
  <TooltipProvider>
    <NuxtLayout fallback="default">
      <NuxtPage />
    </NuxtLayout>
  </TooltipProvider>
</template>

<script lang="ts" setup>
import 'vue-sonner/style.css';
import { useOnline } from '@vueuse/core';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'vue-sonner';

const isOnline = useOnline();
const { t, locale } = useI18n();
const offlineToastId = 'connection-offline';

watch([isOnline, locale], ([online], [wasOnline]) => {
  if (!online) {
    toast.warning(t('connection.offline'), {
      id: offlineToastId,
      description: t('connection.offline_description'),
      duration: Infinity,
    });
  } else if (!wasOnline) {
    toast.dismiss(offlineToastId);
    toast.success(t('connection.online'), {
      description: t('connection.online_description'),
      duration: 3000,
    });
  }
});
</script>
