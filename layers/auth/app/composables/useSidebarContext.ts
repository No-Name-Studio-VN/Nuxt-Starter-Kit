import type {
  SidebarContext,
  SidebarGuardContext,
  SidebarSection,
} from '#layers/auth/types/sidebar';
import { getSidebarContexts, SIDEBAR_GUARD_CONTEXT_KEY } from '#layers/auth/app/constants/sidebar';

const sidebarContextOverride = ref<string | null>(null);

export function useSidebarContext() {
  const route = useRoute();
  const { user } = useUserSession();

  /**
   * What the guards read besides the user. A module such as feature-flags provides
   * live values from an app plugin; without one every guard sees an empty flag set.
   */
  const guardContextSource = inject(SIDEBAR_GUARD_CONTEXT_KEY, null);
  const guardContext =
    guardContextSource?.() ?? computed<SidebarGuardContext>(() => ({ flags: {} }));

  // Layer plugins fill the nav registry while the app starts, after this module
  // loads, so the contexts are read here rather than once at import time.
  const contexts = computed(() => getSidebarContexts());

  const defaultContext = computed<SidebarContext>(() => {
    const firstContext = contexts.value[0];
    if (!firstContext) {
      throw new Error('Sidebar contexts must include at least one context.');
    }
    return contexts.value.find((ctx) => ctx.id === 'main') ?? firstContext;
  });

  const getContextById = (id: string) => {
    return contexts.value.find(
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
      contexts.value.find((ctx) => {
        if (ctx.match !== '/' && !path.startsWith(ctx.match)) return false;
        if (
          ctx.match === '/' &&
          path !== '/' &&
          contexts.value.some((c) => c.match !== '/' && path.startsWith(c.match))
        )
          return false;
        if (ctx.guard && !ctx.guard(user.value, guardContext.value)) return false;
        return true;
      }) ?? defaultContext.value
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
    guardContext,
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
