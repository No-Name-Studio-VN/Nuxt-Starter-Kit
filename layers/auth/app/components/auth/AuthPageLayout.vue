<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { ChevronLeftIcon } from '@lucide/vue';
import { usePreferredReducedMotion } from '@vueuse/core';
import { motion } from 'motion-v';

const props = defineProps<{
  /** Key into `auth.quotes` in site.config; falls back to the `default` entry. */
  page?: string;
}>();

const { t, te } = useI18n();
const config = useConfig();

const quote = computed(() => {
  const { quotes } = config.value.auth;
  const entry = (props.page ? quotes[props.page] : undefined) ?? quotes.default;
  if (!entry?.text) return undefined;

  return {
    text: te(entry.text) ? t(entry.text) : entry.text,
    author: entry.author && te(entry.author) ? t(entry.author) : entry.author,
  };
});

// three.js is heavy, so the background ships in its own chunk and only loads on auth pages.
const HeroGeometric = defineAsyncComponent(
  () => import('@/components/ui/hero-geometric/HeroGeometric.vue'),
);

const colorMode = useColorMode();
const reducedMotion = usePreferredReducedMotion();

/**
 * The shader only takes hex, so the theme tokens are resolved in the browser.
 * Bands run from `--primary` into a faint primary tint, so the frosted panel
 * always has colour behind it while staying near `--background` for contrast.
 */
const heroColors = ref({ accent: '#8e51ff', tint: '#f3eeff', base: '#ffffff' });

function syncHeroColors() {
  const styles = getComputedStyle(document.body);
  const primary = styles.getPropertyValue('--primary').trim();
  const background = styles.getPropertyValue('--background').trim();

  heroColors.value = {
    accent: cssColorToHex(primary) ?? heroColors.value.accent,
    tint:
      cssColorToHex(`color-mix(in oklab, ${primary} 18%, ${background})`) ?? heroColors.value.tint,
    base: cssColorToHex(background) ?? heroColors.value.base,
  };
}

onMounted(syncHeroColors);
watch(() => colorMode.value, syncHeroColors, { flush: 'post' });

const enterMotion = computed(() =>
  reducedMotion.value === 'reduce'
    ? { initial: false, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      },
);
</script>

<template>
  <main class="relative isolate h-dvh overflow-hidden bg-background text-foreground">
    <HeroGeometric
      aria-hidden="true"
      class="absolute inset-0 -z-10 h-full min-h-0 bg-background"
      :color1="heroColors.accent"
      :color2="heroColors.tint"
      :color3="heroColors.base"
      :speed="0.6"
    />

    <div class="grid h-full lg:grid-cols-2">
      <!-- Brand side: left clear so the background carries the visual weight. -->
      <aside class="relative hidden h-full flex-col justify-between p-10 lg:flex xl:p-14">
        <AuthBrand />

        <motion.figure
          v-if="quote"
          :initial="enterMotion.initial"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ ...enterMotion.transition, delay: 0.15 }"
          class="max-w-md rounded-lg border border-border/60 bg-background/70 p-6 shadow-sm backdrop-blur-md"
        >
          <blockquote class="text-lg/relaxed font-medium tracking-tight text-pretty">
            &ldquo;{{ quote.text }}&rdquo;
          </blockquote>
          <figcaption v-if="quote.author" class="mt-4 text-sm text-muted-foreground">
            {{ quote.author }}
          </figcaption>
        </motion.figure>
      </aside>

      <!-- Auth side: a frosted panel on desktop, a frosted card on mobile. -->
      <section
        class="relative flex h-full min-h-0 flex-col lg:border-l lg:border-border/60 lg:bg-background/75 lg:backdrop-blur-2xl lg:backdrop-saturate-150"
      >
        <header class="flex shrink-0 items-center justify-between p-3 sm:p-4 lg:px-6">
          <Button
            variant="ghost"
            size="sm"
            class="bg-background/60 backdrop-blur-md lg:bg-transparent lg:backdrop-filter-none"
            as-child
          >
            <NuxtLink to="/">
              <ChevronLeftIcon aria-hidden="true" class="size-4" />
              Home
            </NuxtLink>
          </Button>
          <DarkModeToggle
            class="bg-background/60 backdrop-blur-md lg:bg-transparent lg:backdrop-filter-none"
          />
        </header>

        <!-- Scrolls only as a fallback on very short viewports so content is never clipped. -->
        <div class="flex min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-10">
          <motion.div
            :initial="enterMotion.initial"
            :animate="{ opacity: 1, y: 0 }"
            :transition="enterMotion.transition"
            class="m-auto flex w-full max-w-sm flex-col gap-6 rounded-xl border border-border/60 bg-background/75 p-6 shadow-xl backdrop-blur-2xl backdrop-saturate-150 sm:p-8 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-filter-none"
          >
            <AuthBrand size="sm" class="lg:hidden" />

            <slot />
          </motion.div>
        </div>
      </section>
    </div>
  </main>
</template>
