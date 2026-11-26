<template>
  <CommandDialog v-model:open="open">
    <CommandInput
      v-model="input"
      :loading="searchLoading"
      :placeholder="$t(placeholderDetailed)"
      @keydown.enter="handleEnter"
      @keydown.down="handleNavigate(1)"
      @keydown.up="handleNavigate(-1)"
      @keydown.escape="handleClose"
    />
    <CommandList class="text-sm" @escape-key-down="handleClose">
      <template v-if="!input?.length">
        <template v-for="item in navigation" :key="item.path">
          <CommandGroup v-if="item.children" :heading="item.title" class="p-1.5">
            <NuxtLinkLocale
              v-for="child in item.children"
              :key="child.stem"
              :to="navTargetFromPath(child.path, navigation)"
              @click="handleClose"
            >
              <CommandItem :value="child.path">
                <CtIcon
                  v-if="typeof child.icon === 'string' && child.icon"
                  :name="child.icon"
                  class="mr-2 size-4"
                />
                <FileIcon v-else class="mr-2 size-4" />
                <span>{{ child.title }}</span>
              </CommandItem>
            </NuxtLinkLocale>
          </CommandGroup>
          <CommandSeparator v-if="item.children" />
        </template>
        <CommandGroup :heading="$t('common.theme')" class="p-1.5">
          <CommandItem value="light" @click="colorMode.preference = 'light'">
            <CtIcon name="lucide:sun" class="mr-2 size-4" />
            <span>{{ $t('common.light') }}</span>
          </CommandItem>
          <CommandItem value="dark" @click="colorMode.preference = 'dark'">
            <CtIcon name="lucide:moon" class="mr-2 size-4" />
            <span>{{ $t('common.dark') }}</span>
          </CommandItem>
          <CommandItem value="system" @click="colorMode.preference = 'auto'">
            <CtIcon name="lucide:monitor" class="mr-2 size-4" />
            <span>{{ $t('common.system') }}</span>
          </CommandItem>
        </CommandGroup>
      </template>

      <div v-else-if="searchResult?.length" class="p-1.5 space-y-1">
        <NuxtLinkLocale
          v-for="(item, i) in searchResult"
          :id="`search-result-${i}`"
          :key="item.id"
          :href="item.id"
          class="block select-none rounded-lg border border-transparent p-3 hover:cursor-pointer hover:bg-muted hover:border-border transition-colors"
          :class="[i === activeSelect && 'bg-muted border-border']"
          @click="handleClose"
        >
          <!-- Row 1: Navigation breadcrumb with highlighting -->
          <div class="flex items-center gap-1 text-xs text-muted-foreground mb-1.5 flex-wrap">
            <CtIcon
              v-if="getItemIcon(item.id)"
              :name="getItemIcon(item.id)"
              class="size-3.5 shrink-0"
            />
            <template v-for="(subtitle, j) in item.titles" :key="`${subtitle}${j}`">
              <span class="truncate max-w-35">
                <template v-for="(part, index) in highlightParts(subtitle)" :key="index">
                  <mark v-if="index % 2" class="bg-primary/20 text-primary rounded px-0.5">{{
                    part
                  }}</mark>
                  <template v-else>{{ part }}</template>
                </template>
              </span>
              <ChevronRightIcon
                v-if="item.titles.length > 1 && j !== item.titles.length - 1"
                class="size-3 shrink-0 text-muted-foreground/50"
              />
            </template>
          </div>

          <!-- Row 2: Section title with highlighting -->
          <div class="font-medium text-foreground leading-tight mb-1">
            <template v-for="(part, index) in highlightParts(item.title)" :key="index">
              <mark v-if="index % 2" class="bg-primary/20 text-primary rounded px-0.5">{{
                part
              }}</mark>
              <template v-else>{{ part }}</template>
            </template>
          </div>

          <!-- Row 3: Content preview with highlighting -->
          <div v-if="item.content" class="text-xs/relaxed text-muted-foreground line-clamp-2">
            <template v-for="(part, index) in highlightParts(item.content)" :key="index">
              <mark v-if="index % 2" class="bg-primary/20 text-primary rounded px-0.5">{{
                part
              }}</mark>
              <template v-else>{{ part }}</template>
            </template>
          </div>
        </NuxtLinkLocale>
      </div>

      <LoadingSpinner v-else-if="searchLoading" class="mx-auto" size="lg" />
      <Empty v-else>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>{{ $t('errors.no_result') }}</EmptyTitle>
          <EmptyDescription>{{ $t('blog.no_results_description') }}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </CommandList>
  </CommandDialog>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import MiniSearch, { type SearchResult } from 'minisearch';
import { useContentHelpers } from '#layers/content/app/composables/useContentHelpers';
import { localizeSearchSections } from '#layers/content/app/utils/contentSearch';
import { ChevronRightIcon, FileIcon, SearchXIcon } from '@lucide/vue';
import CtIcon from '#layers/content/app/components/content/CtIcon.vue';

const store = useSearchDialogStore();
const open = computed({
  get: () => store.open,
  set: (val: boolean) => store.setOpen(val),
});
const { setOpen } = store;
const colorMode = useColorMode();
const { locale, defaultLocale, availableLocales } = useI18n();
const localePath = useLocalePath();
const { placeholderDetailed } = useDocsConfig().value.search;

const input = ref('');
const activeSelect = ref(0);
const searchLoading = ref(false);
const searchResult = ref<SearchResult[] | null>(null);

const { Meta_K, Ctrl_K } = useMagicKeys({
  passive: false,
  onEventFired(e) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) e.preventDefault();
  },
});

watch([Meta_K, Ctrl_K], (v) => {
  if (v[0] || v[1]) setOpen(true);
});

function resetState() {
  input.value = '';
  activeSelect.value = 0;
  searchResult.value = null;
}

// Nuxt Content v3: Load all searchable sections once, then filter with MiniSearch
const { data: searchSections } = await useAsyncData(
  'search-sections',
  () => queryCollectionSearchSections('content'),
  { server: false },
);

const miniSearch = computed(() => {
  const index = new MiniSearch({
    fields: ['title', 'content'],
    storeFields: ['title', 'content', 'titles', 'id', 'level'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
    },
  });
  const sections = localizeSearchSections(
    searchSections.value ?? [],
    locale.value,
    defaultLocale,
    availableLocales,
  );
  index.addAll(sections);
  return index;
});

// Debounced search: watch + shallowRef instead of computed with side effects
const debouncedSearch = useDebounceFn(() => {
  const term = input.value?.trim();
  if (!term) {
    searchResult.value = null;
    searchLoading.value = false;
    return;
  }
  searchResult.value = miniSearch.value.search(term);
  activeSelect.value = 0;
  searchLoading.value = false;
}, 200);

watch([input, locale, searchSections], () => {
  if (input.value.trim()) {
    searchLoading.value = true;
  }
  debouncedSearch();
});

const highlightPattern = computed(() => {
  const searchTerms = input.value.trim().split(/\s+/).filter(Boolean);
  if (searchTerms.length === 0) return;

  const escapedTerms = searchTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${escapedTerms.join('|')})`, 'gi');
});

function highlightParts(text: string) {
  // A capturing group keeps matches at odd indices without interpreting the text as HTML.
  const pattern = highlightPattern.value;
  return pattern ? text.split(pattern) : [text];
}

const { navKeyFromPath } = useContentHelpers();
const { navigation } = useI18nDocs();

function getItemIcon(path: string): string | undefined {
  const navKey = navKeyFromPath(path.split('#', 1)[0] ?? '', 'icon', navigation.value);
  return typeof navKey === 'string' && navKey ? navKey : undefined;
}

watch(activeSelect, (value) => {
  document.querySelector(`[id="search-result-${value}"]`)?.scrollIntoView({ block: 'nearest' });
});

function handleEnter() {
  const path = searchResult.value?.[activeSelect.value]?.id;
  if (typeof path !== 'string') return;

  setOpen(false);
  resetState();
  nextTick(() => navigateTo(localePath(path)));
}

function handleNavigate(delta: -1 | 1) {
  if (!searchResult.value?.length) return;
  const next = activeSelect.value + delta;
  if (next >= 0 && next < searchResult.value.length) {
    activeSelect.value = next;
  }
}

function handleClose() {
  setOpen(false);
  // Clear input after a short delay to allow dialog close animation
  nextTick(() => {
    setTimeout(() => {
      resetState();
    }, 150);
  });
}
</script>
