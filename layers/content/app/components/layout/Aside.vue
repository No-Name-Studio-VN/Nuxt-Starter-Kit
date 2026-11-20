<template>
  <ScrollArea
    orientation="vertical"
    class="relative h-full overflow-hidden py-6 pr-6 text-sm md:pr-4"
    type="hover"
  >
    <LayoutHeaderNavMobile v-if="isMobile" class="mb-5 border-b pb-2" />
    <LayoutSearchButton
      v-if="config.search.inAside"
      :enable="config.search.enable"
      :in-aside="config.search.inAside"
      :search-style="config.search.style"
      :placeholder="config.search.placeholder"
    />
    <ul
      v-if="navigationReady && config.aside.useLevel && config.aside.levelStyle === 'aside'"
      class="flex flex-col gap-1 border-b pb-4"
    >
      <li v-for="link in navigation" :key="link.stem">
        <NuxtLinkLocale
          :to="navTargetFromPath(link.path, navigation)"
          class="text-foreground/80 hover:bg-muted hover:text-primary flex h-8 items-center gap-2 rounded-md p-2 text-sm"
          :class="[isContentPathWithin(path, link.path) && 'bg-muted text-primary! font-medium']"
        >
          <CtIcon v-if="link.icon" :name="link.icon" class="self-center" :size="16" />
          {{ link.title }}

          <span v-for="(badge, i) in navigationBadges(link)" :key="i">
            <Badge :variant="badge.variant" :type="badge.type" :size="badge.size ?? 'sm'">
              {{ badge.value }}
            </Badge>
          </span>
        </NuxtLinkLocale>
      </li>
    </ul>
    <LayoutNavigationSkeleton v-if="!navigationReady" :label="$t('docs.loading_navigation')" />
    <LayoutAsideTree
      v-else-if="tree"
      :links="tree"
      :level="0"
      :class="[config.aside.useLevel && config.aside.levelStyle === 'aside' ? 'pt-4' : 'pt-1']"
    />
  </ScrollArea>
</template>

<script setup lang="ts">
import { navTargetFromPath, useContentHelpers } from '#layers/content/app/composables/useContentHelpers';
import { isContentPathWithin } from '#layers/content/app/utils/contentPaths';
import CtIcon from '#layers/content/app/components/content/CtIcon.vue';

defineProps<{ isMobile: boolean }>();

const config = useDocsConfig();
const { navDirFromPath } = useContentHelpers();

const { navigation, path } = useI18nDocs();
const navigationReady = computed(() => navigation.value !== null);

const tree = computed(() => {
  if (config.value.aside.useLevel) {
    const leveledPath = path.value.split('/').slice(0, 2).join('/');
    return navDirFromPath(leveledPath, navigation.value) ?? [];
  }

  return navigation.value;
});
</script>
