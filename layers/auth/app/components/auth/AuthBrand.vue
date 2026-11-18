<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md';
    class?: HTMLAttributes['class'];
  }>(),
  {
    size: 'md',
    class: undefined,
  },
);

const { t, te } = useI18n();
const header = computed(() => useConfig().value.header);

const title = computed(() => (te(header.value.title) ? t(header.value.title) : header.value.title));
// A single image covers both modes when the light and dark logos are the same file.
const hasDarkVariant = computed(() => header.value.logo.dark !== header.value.logo.light);
// Without a logo the title is the only brand mark, so it shows regardless of `showTitle`.
const showTitle = computed(
  () => !!title.value && (header.value.showTitle || !header.value.logo.light),
);
// The image is the only label when the title is hidden, so it needs alt text then.
const logoAlt = computed(() => (showTitle.value ? '' : title.value));
const logoClass = computed(() => (props.size === 'sm' ? 'size-7' : 'size-9'));
</script>

<template>
  <NuxtLink
    to="/"
    :class="
      cn(
        'flex items-center gap-2.5 self-start rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        props.class,
      )
    "
  >
    <template v-if="header.logo.light">
      <NuxtImg
        :src="header.logo.light"
        :alt="logoAlt"
        :class="cn(logoClass, 'shrink-0 object-contain', hasDarkVariant && 'dark:hidden')"
      />
      <NuxtImg
        v-if="hasDarkVariant && header.logo.dark"
        :src="header.logo.dark"
        :alt="logoAlt"
        :class="cn(logoClass, 'hidden shrink-0 object-contain dark:block')"
      />
    </template>
    <span
      v-if="showTitle"
      :class="cn('font-semibold tracking-tight', props.size === 'md' && 'text-lg')"
    >
      {{ title }}
    </span>
  </NuxtLink>
</template>
