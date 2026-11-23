<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AnimatedToc } from '@/components/ui/animated-toc';
import { useBlogArticle } from '#layers/content/app/composables/useBlogContent';
import { useBlogPostSnap } from '#layers/content/app/composables/useBlogPostSnap';
import { useContentToc } from '#layers/content/app/composables/useContentToc';
import { useClipboard, useMediaQuery, usePreferredReducedMotion } from '@vueuse/core';
import {
  ArrowLeft,
  ArrowRight,
  CheckIcon,
  ChevronDown,
  Link2Icon,
  ListIcon,
  Newspaper,
  SearchXIcon,
} from '@lucide/vue';
import { FacebookIcon, XIcon } from 'vue3-simple-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { joinURL, withoutTrailingSlash } from 'ufo';

definePageMeta({
  layout: 'default',
  key: (route) => route.path,
});

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const site = useSiteConfig();
const requestUrl = useRequestURL();
const localePath = useLocalePath();
const routePath = withoutTrailingSlash(route.path);
const { data, error } = await useBlogArticle(routePath);
if (error.value) throw error.value;
const post = computed(() => data.value?.post);
const contentLocale = computed(() => data.value?.contentLocale ?? locale.value);
const showsFallback = computed(() => Boolean(post.value) && contentLocale.value !== locale.value);

const requestEvent = useRequestEvent();
if (requestEvent && !post.value) {
  setResponseStatus(requestEvent, 404, 'Page Not Found');
}

const cover = computed(() => {
  const image = post.value?.image;
  if (image?.src) return image;
  const og = post.value?.ogImage;
  return og?.url ? { src: og.url } : undefined;
});
const details = computed(() => post.value?.details ?? []);
const tocLinks = computed(() => post.value?.body?.toc?.links ?? []);
const { items: tocItems, activeIndex: tocActiveIndex } = useContentToc(tocLinks, {
  scopeSelector: '.blog-prose',
});
const readingTime = computed(() => Math.max(1, post.value?.readingTime ?? 1));

const publishedDate = computed(() => data.value?.publishedDate ?? '');
const morePosts = computed(() => data.value?.morePosts ?? []);

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const article = useTemplateRef<HTMLElement>('article');
const body = useTemplateRef<HTMLElement>('body');
const reducedMotion = usePreferredReducedMotion();
const snapEnabled = useMediaQuery(
  '(min-width: 1024px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)',
);
useBlogPostSnap(article, body, snapEnabled);

const contentsOpen = shallowRef(false);
let pendingHeading: string | undefined;

function selectMobileHeading(index: number, event: MouseEvent) {
  const href = tocItems.value[index]?.href;
  if (!href) return;
  event.preventDefault();
  // NuxtLink's hash handler still navigates on a default-prevented click.
  event.stopImmediatePropagation();
  pendingHeading = href;
  contentsOpen.value = false;
}

async function afterContentsClose(event: Event) {
  const href = pendingHeading;
  if (!href) return; // Escape and other dismissals should return focus to the trigger.
  pendingHeading = undefined;
  event.preventDefault();

  // The Sheet's focus scope and scroll lock finish cleaning up on close.
  await nextTick();
  requestAnimationFrame(() => {
    const heading = body.value?.querySelector<HTMLElement>(
      `.blog-prose #${CSS.escape(href.slice(1))}`,
    );
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    void router.push({ path: route.path, query: route.query, hash: href });
  });
}

function scrollToBody() {
  body.value?.focus({ preventScroll: true });
  body.value?.scrollIntoView({ behavior: reducedMotion.value === 'reduce' ? 'instant' : 'smooth' });
}

const shareUrl = computed(() => joinURL(site.url || requestUrl.origin, routePath));
const { copy, copied } = useClipboard({ copiedDuring: 2000 });
const shareLinks = computed(() => [
  {
    label: 'Facebook',
    icon: FacebookIcon,
    href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl.value)}`,
  },
  {
    label: 'X',
    icon: XIcon,
    href: `https://x.com/intent/post?url=${encodeURIComponent(shareUrl.value)}&text=${encodeURIComponent(post.value?.title ?? '')}`,
  },
]);

useSeo({
  title: computed(() => post.value?.seo?.title || post.value?.title || t('errors.not_found.title')),
  description: computed(() => post.value?.seo?.description || post.value?.description),
  type: computed(() => (post.value ? 'article' : 'website')),
  ogImage: computed(() => post.value?.seo?.ogImage || post.value?.ogImage?.url || cover.value?.src),
  publishedAt: computed(() => (publishedDate.value ? post.value?.publishedAt : undefined)),
});
</script>

<template>
  <div v-if="!post" class="flex min-h-dvh items-center justify-center px-4 pt-24">
    <div class="flex flex-col items-center text-center">
      <SearchXIcon class="mb-4 size-12 text-muted-foreground/50" />
      <h1 class="mb-2 text-xl font-bold text-foreground">{{ $t('errors.not_found.title') }}</h1>
      <p class="mb-6 text-muted-foreground">{{ $t('errors.not_found.description') }}</p>
      <Button as-child variant="outline" class="rounded-full px-6">
        <NuxtLink :to="localePath('/blogs')">
          <ArrowLeft />
          {{ $t('blog.back_to_blog') }}
        </NuxtLink>
      </Button>
    </div>
  </div>

  <template v-else>
    <article ref="article" data-post-panels>
      <!-- Header: the cover sits faintly behind the metadata and fades out at the
           bottom; scrolling snaps from here to the article body. -->
      <section
        class="relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden"
      >
        <template v-if="cover">
          <NuxtImg
            :src="cover.src"
            alt=""
            aria-hidden="true"
            class="absolute inset-0 -z-30 size-full scale-105 object-cover opacity-80 dark:opacity-80"
            fetchpriority="high"
          />
          <!-- Readability: a soft pool of the page colour behind the copy. -->
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(ellipse_60%_55%_at_50%_50%,color-mix(in_oklch,var(--background)_75%,transparent)_0%,color-mix(in_oklch,var(--background)_35%,transparent)_60%,transparent_100%)]"
          />
          <!-- Top: keeps the transparent navbar readable over the photo. -->
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-16 bg-linear-to-b from-background/80 to-transparent"
          />
          <!-- Bottom: blur that strengthens downwards, then a fade into the page. -->
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-16 backdrop-blur-xl mask-[linear-gradient(to_bottom,transparent,black_70%)]"
          />
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-56 bg-linear-to-b from-transparent to-background"
          />
        </template>

        <header class="mx-auto max-w-3xl px-4 py-28 text-center sm:px-6">
          <NuxtLink
            :to="localePath('/blogs')"
            class="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft class="size-4" />
            {{ $t('blog.back_to_blog') }}
          </NuxtLink>

          <div
            class="mb-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground"
          >
            <Badge
              v-if="post.category"
              variant="secondary"
              class="rounded-full px-3 font-medium text-primary"
            >
              {{ post.category }}
            </Badge>
            <span class="inline-flex items-center gap-3 whitespace-nowrap">
              <time v-if="publishedDate" :datetime="post.publishedAt">
                {{ publishedDate }}
              </time>
              <span v-if="publishedDate" aria-hidden="true" class="text-border">&bull;</span>
              <span>{{ $t('blog.min_read', { time: readingTime }) }}</span>
            </span>
          </div>

          <h1
            class="text-3xl/tight font-bold tracking-tight text-balance text-foreground sm:text-4xl/tight lg:text-5xl/tight"
          >
            {{ post.title }}
          </h1>
          <p
            v-if="post.description"
            class="mx-auto mt-5 max-w-2xl text-lg/relaxed text-pretty text-foreground"
          >
            {{ post.description }}
          </p>

          <div
            v-if="post.authors?.length"
            class="mt-8 flex flex-wrap items-center justify-center gap-6"
          >
            <component
              :is="author.to ? 'a' : 'div'"
              v-for="author in post.authors"
              :key="author.name"
              :href="author.to"
              :target="author.target"
              class="flex items-center gap-2.5"
            >
              <Avatar class="size-9 border">
                <AvatarImage v-if="author.avatar" :src="author.avatar" :alt="author.name" />
                <AvatarFallback class="text-xs font-semibold">
                  {{ initials(author.name) }}
                </AvatarFallback>
              </Avatar>
              <span class="text-sm font-semibold text-foreground">{{ author.name }}</span>
            </component>
          </div>
        </header>

        <p
          v-if="cover?.caption"
          class="absolute right-4 bottom-6 hidden max-w-xs text-right text-xs text-muted-foreground/80 sm:right-6 sm:block"
        >
          {{ cover.caption }}
        </p>

        <button
          type="button"
          class="absolute bottom-8 left-1/2 -translate-x-1/2 cursor-pointer rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
          :aria-label="$t('blog.scroll_to_article')"
          @click="scrollToBody"
        >
          <ChevronDown class="size-5 animate-bounce motion-reduce:animate-none" />
        </button>
      </section>

      <section id="post-body" ref="body" tabindex="-1" class="pt-16 pb-20 lg:pt-24">
        <!-- Body + table of contents -->
        <div
          class="mx-auto max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,42rem)_minmax(0,1fr)] lg:gap-10"
        >
          <div class="hidden lg:block" />

          <div class="min-w-0">
            <LayoutTranslationNotice v-if="showsFallback" class="mb-4" />

            <Sheet v-if="tocItems.length" v-model:open="contentsOpen">
              <SheetTrigger as-child>
                <Button variant="outline" size="sm" class="mb-6 lg:hidden">
                  <ListIcon aria-hidden="true" />
                  {{ $t('blog.on_this_page') }}
                </Button>
              </SheetTrigger>
              <SheetContent
                :aria-describedby="undefined"
                class="motion-reduce:animate-none motion-reduce:transition-none"
                @close-auto-focus="afterContentsClose"
              >
                <SheetHeader class="pr-12">
                  <SheetTitle>{{ $t('blog.on_this_page') }}</SheetTitle>
                </SheetHeader>
                <div class="min-h-0 overflow-y-auto px-4 pb-6">
                  <AnimatedToc
                    v-model="tocActiveIndex"
                    :items="tocItems"
                    title=""
                    :aria-label="$t('blog.on_this_page')"
                    @select="selectMobileHeading"
                  />
                </div>
              </SheetContent>
            </Sheet>

            <dl
              v-if="details.length"
              class="mb-10 grid gap-x-8 gap-y-4 rounded-2xl border bg-muted/40 p-5 sm:grid-cols-2 sm:p-6"
            >
              <div v-for="detail in details" :key="detail.label">
                <dt class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {{ detail.label }}
                </dt>
                <dd class="mt-1 text-[15px]/relaxed font-medium text-foreground">
                  {{ detail.value }}
                </dd>
              </div>
            </dl>

            <ContentRenderer
              :key="post.id"
              :value="post"
              :lang="contentLocale"
              class="docs-content blog-prose"
            />

            <!-- Tags + share -->
            <footer
              class="mt-14 flex flex-col gap-6 border-t pt-8 sm:flex-row sm:items-center sm:justify-between"
            >
              <div v-if="post.tags?.length" class="flex flex-wrap gap-2">
                <Badge
                  v-for="tag in post.tags"
                  :key="tag"
                  variant="outline"
                  class="rounded-full px-3 py-1 font-normal text-muted-foreground"
                >
                  #{{ tag }}
                </Badge>
              </div>
              <div class="flex items-center gap-1 sm:ml-auto">
                <span class="mr-2 text-sm text-muted-foreground">{{ $t('blog.share') }}</span>
                <Button
                  v-for="link in shareLinks"
                  :key="link.label"
                  as-child
                  variant="outline"
                  size="icon"
                  class="size-9 rounded-full"
                >
                  <a
                    :href="link.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="link.label"
                  >
                    <component :is="link.icon" class="size-4" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  class="size-9 rounded-full"
                  :aria-label="$t('blog.copy_link')"
                  @click="copy(shareUrl)"
                >
                  <CheckIcon v-if="copied" class="size-4 text-primary" />
                  <Link2Icon v-else class="size-4" />
                </Button>
              </div>
            </footer>
          </div>

          <aside v-if="tocItems.length" class="hidden text-sm lg:block">
            <div class="sticky top-28">
              <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {{ $t('blog.on_this_page') }}
              </p>
              <AnimatedToc
                v-model="tocActiveIndex"
                :items="tocItems"
                title=""
                :aria-label="$t('blog.on_this_page')"
              />
            </div>
          </aside>
        </div>

        <!-- More posts -->
        <section v-if="morePosts?.length" class="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
          <div class="mb-8 flex items-end justify-between gap-4">
            <h2 class="text-2xl font-bold tracking-tight text-foreground">
              {{ $t('blog.more_posts') }}
            </h2>
            <NuxtLink
              :to="localePath('/blogs')"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {{ $t('blog.view_all') }}
              <ArrowRight class="size-4" />
            </NuxtLink>
          </div>
          <div class="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
            <NuxtLink
              v-for="item in morePosts"
              :key="item.path"
              :to="localePath(item.path)"
              class="group flex flex-col"
            >
              <div class="relative mb-5 aspect-4/3 w-full overflow-hidden rounded-2xl bg-muted">
                <NuxtImg
                  v-if="item.image?.src || item.ogImage?.url"
                  :src="item.image?.src || item.ogImage?.url"
                  :alt="item.title"
                  loading="lazy"
                  class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div v-else class="flex size-full items-center justify-center bg-primary/5">
                  <Newspaper class="size-12 text-primary/20" />
                </div>
              </div>
              <div class="mb-2 text-sm text-muted-foreground">
                <time v-if="item.date" :datetime="item.publishedAt">{{ item.date }}</time>
                <template v-if="item.category">
                  <template v-if="item.date"> &middot; </template>{{ item.category }}
                </template>
              </div>
              <h3
                class="line-clamp-2 text-lg/snug font-bold text-foreground transition-colors group-hover:text-primary"
              >
                {{ item.title }}
              </h3>
            </NuxtLink>
          </div>
        </section>
      </section>
    </article>
  </template>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  :global(html:has([data-post-panels])) {
    scroll-behavior: auto;
  }
}
</style>
