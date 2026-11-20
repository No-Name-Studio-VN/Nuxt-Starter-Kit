<template>
  <div>
    <LayoutBanner v-if="config.banner.enable" />
    <LayoutHeader />
    <!--
      Keep <slot /> at one fixed position. Moving it between v-if branches remounts
      <NuxtPage> while its Suspense is still resolving the next route.
    -->
    <div class="min-h-screen" :class="{ 'border-b': showShell && config.footer.border }">
      <div
        :class="
          showShell && [
            'flex-1 items-start px-4 md:grid md:gap-6 md:px-8 lg:gap-10',
            config.main.padded && 'container',
            showAside && 'md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]',
          ]
        "
      >
        <aside
          v-if="showAside"
          class="fixed z-30 -ml-2 hidden w-full shrink-0 overflow-y-auto top-25.5 md:sticky md:block"
          :class="[
            config.aside.useLevel && config.aside.levelStyle === 'aside'
              ? 'h-[calc(100vh-3.5rem)] md:top-15.25'
              : 'h-[calc(100vh-6rem)] md:top-25.25',
          ]"
        >
          <LayoutAside :is-mobile="false" />
        </aside>
        <slot />
      </div>
    </div>
    <BackToTop />
    <LayoutFooter />
  </div>
</template>

<script setup lang="ts">
import {
  useDocsNavigation,
  useDocsPageContent,
  usePageData,
} from '#layers/content/app/composables/usePageData';

const route = useRoute();
const { page, navigation } = usePageData();

// Seed page flags before the shell renders: the page's own fetch runs too late on
// SSR, and the sidebar/fullpage columns would change on hydration. This runs once
// per layout mount; on client navigation each page publishes its own content.
// Do not watch the route here: refetching from the layout swaps the shared page
// while <NuxtPage> is mid-transition and crashes the renderer.
const pageRequest = useDocsPageContent(route.path);
const navigationRequest = useDocsNavigation();
// Resolve navigation in the layout too, so server and hydration can render the same tree.
const [{ data: initialPage }, { data: navData }] = await Promise.all([
  pageRequest,
  navigationRequest,
]);
page.value = initialPage.value?.page ?? null;
watch(
  navData,
  (value) => {
    navigation.value = value ?? [];
  },
  { immediate: true },
);

const config = useDocsConfig();
const { themeClass, radius, setClassTheme } = useThemes();

const baseRouteName = computed(() => useRouteBaseName()(route));
const showShell = computed(() => !page.value?.fullpage && baseRouteName.value !== 'index');
const showAside = computed(() => showShell.value && (page.value?.aside ?? true));

useHead({
  bodyAttrs: {
    class: themeClass.value,
    style: `--radius: ${radius.value}rem;`,
  },
});

onMounted(() => {
  setClassTheme();
});
</script>
