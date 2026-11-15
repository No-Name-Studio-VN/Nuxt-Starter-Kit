<template>
  <div v-if="!page?.body" class="flex h-[calc(100vh-3.5rem)] items-center justify-center">
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleXIcon />
        </EmptyMedia>
        <EmptyTitle>{{ $t('errors.not_found.title') }}</EmptyTitle>
        <EmptyDescription>{{ $t('errors.not_found.description') }}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <InputGroup class="sm:w-3/4">
          <InputGroupInput
            :placeholder="$t('cta.search_pages')"
            readonly
            @click.stop="openSearchDialog()"
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <EmptyDescription>
          <i18n-t keypath="cta.need_help">
            <template #contact>
              <NuxtLinkLocale href="/#contact">
                {{ $t('cta.contact') }}
              </NuxtLinkLocale>
            </template>
          </i18n-t>
        </EmptyDescription>
      </EmptyContent>
    </Empty>
  </div>

  <div v-else>
    <div
      v-if="page?.fullpage"
      class="px-4 py-6 md:px-8"
      :class="[config.main.padded && 'container']"
    >
      <ContentRenderer :key="page.id" :value="page" :data="config.data" />
    </div>
    <main
      v-else
      class="relative py-6"
      :class="[
        config.toc.enable &&
          (page.toc ?? true) &&
          'lg:grid lg:grid-cols-[1fr_220px] lg:gap-14 lg:py-8',
      ]"
    >
      <div class="mx-auto w-full min-w-0">
        <LayoutBreadcrumb
          v-if="page?.body && config.main.breadCrumb && (page.breadcrumb ?? true)"
          class="mb-4"
        />
        <LayoutTitle
          v-if="config.main.showTitle"
          :title="page?.title"
          :description="page?.description"
          :badges="page?.badges"
          :authors="page?.authors"
        />

        <ContentRenderer :key="page.id" :value="page" :data="config.data" class="docs-content" />

        <LayoutDocsFooter />
      </div>
      <div v-if="config.toc.enable && (page.toc ?? true)" class="hidden text-sm lg:block">
        <div
          class="sticky"
          :class="[
            config.aside.useLevel && config.aside.levelStyle === 'aside'
              ? 'md:top-22.75'
              : 'md:top-33.25',
          ]"
        >
          <LayoutToc :is-small="false" />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
// import { findPageHeadline } from '@nuxt/content/utils'
import { CircleXIcon, SearchIcon } from '@lucide/vue';
import { useDocsPageContent, usePageData } from '#layers/content/app/composables/usePageData';

const route = useRoute();
// <NuxtPage> is keyed by path, so each instance renders exactly one path.
const routePath = route.path;

const { page: sharedPage, navigation, surroundings } = usePageData();

// Step 1: This instance owns its content. It must not render from shared state:
// while the next route resolves, shared state can still hold the previous page,
// and swapping it mid-transition unmounts a suspended ContentRenderer.
const { data: pageData } = await useDocsPageContent(routePath);
const page = computed(() => pageData.value ?? null);
// Publish before rendering so the layout, toc, and edit link match this page.
sharedPage.value = page.value;

// Unknown paths keep the not-found state below but answer 404, so crawlers drop
// them and prerendering doesn't bake them into static 200 pages.
const requestEvent = useRequestEvent();
if (requestEvent && !page.value) {
  setResponseStatus(requestEvent, 404, 'Page Not Found');
}

// Step 2: Fetch navigation server-side so docs layout is stable on first render
const { data: navData } = await useAsyncData('navigation', () => {
  return queryCollectionNavigation('content', [
    'title',
    'description',
    'path',
    'icon',
    'navBadges',
  ]);
});
// Step 3: Prev/next come from the tree above. queryCollectionItemSurroundings would
// rebuild the whole navigation tree just to read two neighbours.
watch(
  navData,
  (val) => {
    navigation.value = val ?? [];
    surroundings.value = page.value ? findSurroundings(val ?? [], routePath) : null;
  },
  { immediate: true },
);

const config = useDocsConfig();

const title = computed(() => page.value?.seo?.title || page.value?.title);
const description = computed(() => page.value?.seo?.description || page.value?.description);

// const headline = computed(() => findPageHeadline(navigation.value, page.value?.path))

definePageMeta({
  layout: 'docs',
});

useSeo({
  title,
  description,
  type: 'article',
  modifiedAt: computed(() => {
    const value = page.value && 'modifiedAt' in page.value ? page.value.modifiedAt : undefined;
    return typeof value === 'string' ? value : undefined;
  }),
  breadcrumbs:
    page.value && navigation.value
      ? computed(() => findPageBreadcrumbs(navigation.value ?? undefined, page.value?.path || ''))
      : undefined,
});

// defineOgImageComponent(config.value.site.ogImageComponent, {
//   headline: headline.value,
//   title: page.value?.title,
//   description: page.value?.description,
// })

// if (page.value?.ogImage) {
//   defineOgImage(page.value?.ogImage)
// }

const { setOpen } = useSearchDialogStore();
function openSearchDialog() {
  setOpen(true);
}
</script>
