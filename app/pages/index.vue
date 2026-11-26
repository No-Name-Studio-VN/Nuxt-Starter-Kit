<script setup lang="ts">
import { isEmpty } from 'es-toolkit/compat';
import { APP_MANIFEST } from '#shared/constants/manifest';

definePageMeta({
  breadcrumb: 'common.home',
});

const { t } = useI18n();

useSeo({
  title: APP_MANIFEST.short_name,
  description: computed(() => t('home.description')),
  type: 'website',
});

const route = useRoute();
if (!isEmpty(route.hash)) {
  const sectionId = route.hash.substring(1);
  setTimeout(() => scrollToSection(sectionId), 300);
}

function scrollToSection(sectionId: string) {
  const element = document.getElementById(sectionId);
  if (element) {
    const headerOffset = 80;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.scrollY - headerOffset;
    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
  }
}
</script>

<template>
  <div>
    <ExtensionSlot name="home:hero">
      <div class="container py-16">
        <div class="prose max-w-none">
          <h1>{{ APP_MANIFEST.name }}</h1>
          <p>{{ $t('home.description') }}</p>
        </div>
      </div>
    </ExtensionSlot>
  </div>
</template>
