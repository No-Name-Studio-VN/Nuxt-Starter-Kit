import type { SidebarContext } from '#layers/dashboard/types/sidebar';
import { getVisibleSidebarContexts } from '#layers/dashboard/app/constants/sidebar';

const sidebarContextOverride = ref<string | null>(null);

export function useSidebarContext() {
  const route = useRoute();
  const guardContext = useNavGuardContext();
  const contexts = computed(() => getVisibleSidebarContexts(guardContext.value));

  const defaultContext = computed<SidebarContext>(() => {
    const firstContext = contexts.value[0];
    if (!firstContext) {
      throw new Error('Sidebar contexts must include at least one context.');
    }
    return contexts.value.find((ctx) => ctx.id === 'main') ?? firstContext;
  });

  const activeContext = computed<SidebarContext>(() => {
    if (sidebarContextOverride.value) {
      const overrideContext = contexts.value.find((ctx) => ctx.id === sidebarContextOverride.value);
      if (overrideContext) return overrideContext;
    }

    const path = route.path;
    return (
      contexts.value.find((ctx) => {
        if (ctx.match !== '/' && !path.startsWith(ctx.match)) return false;
        if (
          ctx.match === '/' &&
          path !== '/' &&
          contexts.value.some((c) => c.match !== '/' && path.startsWith(c.match))
        )
          return false;
        return true;
      }) ?? defaultContext.value
    );
  });

  const visibleSections = computed(() => activeContext.value.sections);

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
