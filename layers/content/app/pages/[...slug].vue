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
      <LayoutTranslationNotice v-if="isFallback" class="mb-4" />
      <ContentRenderer :key="page.id" :value="page" :data="config.data" :lang="contentLocale" />
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
        <LayoutTranslationNotice v-if="isFallback" class="mb-4" />
        <LayoutTitle
          v-if="config.main.showTitle"
          :lang="contentLocale"
          :title="page?.title"
          :description="page?.description"
          :badges="page?.badges"
          :authors="page?.authors"
        />

        <ContentRenderer
          :key="page.id"
          :value="page"
          :data="config.data"
          :lang="contentLocale"
          class="docs-content"
        />

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
import { normalizeContentPath } from '#layers/content/app/utils/contentPaths';
import { BLOG_CONTENT_PATH, parseBlogContentPath } from '#layers/content/app/utils/blogPaths';

const route = useRoute();
// <NuxtPage> is keyed by path, so each instance renders exactly one path.
const routePath = route.path;

const { page: sharedPage, surroundings } = usePageData();
const { navigation } = useI18nDocs();
const { locale, defaultLocale, availableLocales } = useI18n();
if (
  useRuntimeConfig().public.blogBasePath !== BLOG_CONTENT_PATH &&
  parseBlogContentPath(routePath, availableLocales, false)
) {
  throw createError({ statusCode: 404, statusMessage: 'Page Not Found' });
}
const localePath = useLocalePath();
const normalizedRoutePath = normalizeContentPath(routePath, locale.value, defaultLocale);

// Step 1: This instance owns its content. It must not render from shared state:
// while the next route resolves, shared state can still hold the previous page,
// and swapping it mid-transition unmounts a suspended ContentRenderer.
const { data: pageData } = await useDocsPageContent(routePath);
const page = computed(() => pageData.value?.page ?? null);
const isFallback = computed(() => pageData.value?.isFallback ?? false);
const contentLocale = computed(() => (isFallback.value ? defaultLocale : locale.value));
// Publish before rendering so the layout, toc, and edit link match this page.
sharedPage.value = page.value;

// Unknown paths keep the not-found state below but answer 404, so crawlers drop
// them and prerendering doesn't bake them into static 200 pages.
const requestEvent = useRequestEvent();
if (requestEvent && !page.value) {
  setResponseStatus(requestEvent, 404, 'Page Not Found');
}

// Reuse the layout's navigation so prev/next match the localized sidebar.
watch(
  [navigation, page],
  ([items, currentPage]) => {
    surroundings.value = items && currentPage ? findSurroundings(items, normalizedRoutePath) : null;
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
  breadcrumbs: computed(() =>
    page.value
      ? findPageBreadcrumbs(navigation.value ?? undefined, normalizedRoutePath)?.map((item) => ({
          ...item,
          path: localePath(navTargetFromPath(item.path, navigation.value)),
        }))
      : undefined,
  ),
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
