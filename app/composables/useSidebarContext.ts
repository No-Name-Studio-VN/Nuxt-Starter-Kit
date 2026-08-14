import type { SidebarContext, SidebarSection } from '~~/types/common';
import { SIDEBAR_CONTEXTS } from '@/constants/sidebar';

const firstContext = SIDEBAR_CONTEXTS[0];
if (!firstContext) {
  throw new Error('Sidebar contexts must include at least one context.');
}
const DEFAULT_CONTEXT = SIDEBAR_CONTEXTS.find((ctx) => ctx.id === 'main') ?? firstContext;
const sidebarContextOverride = ref<string | null>(null);

export function useSidebarContext() {
  const route = useRoute();
  const { user } = useUserSession();
  const { flags } = useFeatureFlags();

  const guardContext = computed(() => ({
    flags: flags.value,
  }));

  const getContextById = (id: string) => {
    return SIDEBAR_CONTEXTS.find(
      (ctx) => ctx.id === id && (!ctx.guard || ctx.guard(user.value, guardContext.value)),
    );
  };

  const activeContext = computed<SidebarContext>(() => {
    if (sidebarContextOverride.value) {
      const overrideContext = getContextById(sidebarContextOverride.value);
      if (overrideContext) return overrideContext;
    }

    const path = route.path;
    return (
      SIDEBAR_CONTEXTS.find((ctx) => {
        if (ctx.match !== '/' && !path.startsWith(ctx.match)) return false;
        if (
          ctx.match === '/' &&
          path !== '/' &&
          SIDEBAR_CONTEXTS.some((c) => c.match !== '/' && path.startsWith(c.match))
        )
          return false;
        if (ctx.guard && !ctx.guard(user.value, guardContext.value)) return false;
        return true;
      }) ?? DEFAULT_CONTEXT
    );
  });

  const visibleSections = computed<SidebarSection[]>(() => {
    return activeContext.value.sections.filter(
      (section) => !section.guard || section.guard(user.value, guardContext.value),
    );
  });

  const primarySections = computed(() => visibleSections.value.filter((s) => !s.secondary));

  const secondarySections = computed(() => visibleSections.value.filter((s) => s.secondary));

  const sidebarVariant = computed(() => activeContext.value.variant ?? 'inset');
  const showBack = computed(() => activeContext.value.showBack ?? false);
  const isContextView = computed(() => activeContext.value.id !== 'main');

  const showMainSidebar = () => {
    sidebarContextOverride.value = 'main';
  };

  const clearSidebarContextOverride = () => {
    sidebarContextOverride.value = null;
  };

  watch(
    () => route.path,
    () => {
      clearSidebarContextOverride();
    },
  );

  return {
    activeContext,
    visibleSections,
    primarySections,
    secondarySections,
    sidebarVariant,
    showBack,
    isContextView,
    showMainSidebar,
    clearSidebarContextOverride,
  };
}
