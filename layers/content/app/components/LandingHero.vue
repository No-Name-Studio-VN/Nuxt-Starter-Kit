<script setup lang="ts">
import { defaultLocale } from '~~/i18n-constants';
import { APP_MANIFEST } from '#shared/constants/manifest';

const { locale } = useI18n();
const contentId = computed(() =>
  locale.value === defaultLocale ? 'landing/landing.yml' : `landing/${locale.value}/landing.yml`,
);
const { data: page } = await useAsyncData(
  `landing-content-${locale.value}`,
  () => queryCollection('landing').where('id', '=', contentId.value).first(),
  { watch: [contentId] },
);
const hero = computed(() => page.value?.hero ?? {
  title: APP_MANIFEST.name,
  subtitle: APP_MANIFEST.description,
});
</script>

<template>
  <div class="container py-16">
    <div class="prose max-w-none">
      <h1>{{ hero.title }}</h1>
      <p>{{ hero.subtitle }}</p>
    </div>
  </div>
</template>
