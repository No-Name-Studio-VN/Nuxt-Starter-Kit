<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useMagicKeys } from '@vueuse/core';
import { Search } from '@lucide/vue';
import { getVisibleSidebarContexts } from '#layers/dashboard/app/constants/sidebar';
import { useHotSearch } from '#layers/dashboard/app/composables/useHotSearch';

const { isOpen: hotSearchOpen, toggleIsOpen, setIsOpen } = useHotSearch();
const searchQuery = ref('');
const { t, te, locale } = useI18n();

function getFeatureTitle(feature: (typeof features.value)[number]) {
  const key = feature.titleKey ?? feature.title;
  return te(key) ? t(key) : feature.title;
}

const guardContext = useNavGuardContext();
const features = computed(() =>
  getVisibleSidebarContexts(guardContext.value).flatMap((ctx) =>
    ctx.sections.flatMap((section) => section.items),
  ),
);

const filteredFeatures = computed(() => {
  if (!searchQuery.value) return features.value;
  const query = searchQuery.value.toLowerCase();
  return features.value.filter((feature) => getFeatureTitle(feature).toLowerCase().includes(query));
});

const handleSelectFeature = (feature: (typeof features.value)[number]) => {
  if (!feature.url) return;

  navigateTo(feature.url);
  setIsOpen(false);
};

const handleSearchFallback = () => {
  navigateTo({ path: '/search', query: { title: searchQuery.value } });
  setIsOpen(false);
};

// Keyboard shortcut

const { Meta_K, Ctrl_K } = useMagicKeys({
  passive: false,
  onEventFired(e) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) e.preventDefault();
  },
});

watch([Meta_K, Ctrl_K], (v) => {
  if (v[0] || v[1]) toggleIsOpen();
});
</script>

<template>
  <Command>
    <CommandDialog v-model:open="hotSearchOpen">
      <CommandInput v-model="searchQuery" :placeholder="$t('nav.quick_search_placeholder')" />
      <CommandList>
        <template v-if="filteredFeatures.length > 0">
          <CommandGroup :heading="t('nav.search_features')">
            <CommandItem
              v-for="(feature, i) in filteredFeatures"
              :key="`${locale}-${i}`"
              :value="feature.url ?? feature.title"
              @select="() => handleSelectFeature(feature)"
            >
              <component :is="feature.icon" class="mr-2 size-4" />
              <span>{{ getFeatureTitle(feature) }}</span>
            </CommandItem>
          </CommandGroup>

          <CommandGroup v-if="searchQuery" :heading="t('nav.search')">
            <CommandItem :value="'search:' + searchQuery" @select="handleSearchFallback">
              <Search class="mr-2 size-4" />
              <span>{{ t('nav.search_for', { query: searchQuery }) }}</span>
            </CommandItem>
          </CommandGroup>
        </template>

        <Empty v-else>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search class="size-5" />
            </EmptyMedia>
            <EmptyTitle>{{ $t('nav.search_no_results') }}</EmptyTitle>
            <EmptyDescription>
              {{ $t('nav.search_hint') }}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CommandList>
    </CommandDialog>
  </Command>
</template>
