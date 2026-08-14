<template>
  <li>
    <!-- Folder -->
    <div v-if="link.children">
      <template v-if="folderStyle === 'group'">
        <div
          class="text-foreground/70 mt-2 flex items-center gap-2 rounded-md px-2 text-xs font-semibold outline-none"
          :class="[link.navTruncate !== false && 'h-8']"
        >
          <LayoutAsideTreeItemButton :link />
        </div>
        <LayoutAsideTree :links="link.children" :level="level" />
      </template>
      <template v-else>
        <button
          class="text-foreground/80 hover:bg-muted hover:text-primary flex w-full cursor-pointer items-center gap-2 rounded-md p-2 text-left text-sm"
          :class="[link.navTruncate !== false && 'h-8']"
          @click="isOpen = !isOpen"
        >
          <ChevronDownIcon
            v-if="folderStyle === 'tree'"
            class="transition-transform"
            :class="[!isOpen && '-rotate-90']"
            :size="16"
          />
          <LayoutAsideTreeItemButton :link />
          <ChevronDownIcon
            v-if="folderStyle === 'default'"
            class="ml-auto transition-transform"
            :class="[!isOpen && '-rotate-90']"
            :size="16"
          />
        </button>
        <div v-show="isOpen">
          <LayoutAsideTree :links="link.children" :level="level + 1" />
        </div>
      </template>
    </div>
    <!-- Page -->
    <NuxtLinkLocale
      v-else
      :to="link.path"
      class="text-foreground/80 hover:bg-muted hover:text-primary flex items-center gap-2 rounded-md p-2 text-sm"
      :class="[
        isActive && 'bg-muted text-primary! font-medium',
        link.navTruncate !== false && 'h-8',
      ]"
    >
      <LayoutAsideTreeItemButton :link />
    </NuxtLinkLocale>
  </li>
</template>

<script setup lang="ts">
import { ChevronDownIcon } from '@lucide/vue';
import type { ContentNavigationItem } from '@nuxt/content';

const props = defineProps<{
  link: ContentNavigationItem;
  level: number;
}>();

const { collapse, collapseLevel, folderStyle: defaultFolderStyle } = useConfig().value.aside;

const collapsedMapStore = useCollapsedMapStore();
const route = useRoute();

function defaultOpen() {
  if (route.path.includes(props.link.path)) return true;
  if (props.link.collapse !== undefined) return !props.link.collapse;

  return props.level < collapseLevel && !collapse;
}

const isOpen = ref(collapsedMapStore.get(props.link.path) || defaultOpen());

watch(isOpen, (v) => {
  collapsedMapStore.set(props.link.path, v);
});

function normalizePath(p: string) {
  const out = p.replace(/\/+$/, '');
  return out === '' ? '/' : out;
}
const isActive = computed(() => normalizePath(props.link.path) === normalizePath(route.path));

/** `sidebar` is frontmatter, so its shape is checked rather than assumed. */
const folderStyle = computed(() => {
  const sidebar = props.link.sidebar;
  if (typeof sidebar === 'object' && sidebar !== null && 'style' in sidebar) {
    const style = sidebar.style;
    if (typeof style === 'string') return style;
  }
  return defaultFolderStyle;
});
</script>
