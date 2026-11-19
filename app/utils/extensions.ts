import { computed, markRaw, shallowReactive } from 'vue';
import type { NuxtApp } from '#app';
import type {
  ExtensionEntry,
  ExtensionSlotName,
  NavGuardContext,
  NavGuardContextProvider,
  NavGuardContextProviders,
  NavMenu,
  NavMenus,
  NavRegistry,
} from '~~/types/extensions';

// Registries hold static layer contributions, never request-specific state.
const extensions = shallowReactive(new Map<ExtensionSlotName, Map<string, ExtensionEntry>>());
const navItems: NavRegistry = shallowReactive<NavRegistry>({});

const navGuardProviders = new WeakMap<NuxtApp, NavGuardContextProviders>();

export function registerExtension(slot: ExtensionSlotName, entry: ExtensionEntry): void {
  let entries = extensions.get(slot);
  if (!entries) {
    entries = shallowReactive(new Map<string, ExtensionEntry>());
    extensions.set(slot, entries);
  }

  entries.set(entry.id, { ...entry, component: markRaw(entry.component) });
}

export function getExtensions(slot: ExtensionSlotName): readonly ExtensionEntry[] {
  return [...(extensions.get(slot)?.values() ?? [])].sort((a, b) => a.order - b.order);
}

export function registerNavItem<M extends NavMenu>(menu: M, record: NavMenus[M]): void {
  // An empty map is valid for every menu; widen it only after selecting that menu.
  const records: Map<string, NavMenus[M]> = (navItems[menu] ??= shallowReactive(
    new Map<string, never>(),
  ));

  // Augmented menus can define records without an icon field.
  if (
    'icon' in record &&
    record.icon &&
    (typeof record.icon === 'object' || typeof record.icon === 'function')
  ) {
    markRaw(record.icon);
  }

  records.set(record.id, { ...record });
}

export function getNavItems<M extends NavMenu>(menu: M): readonly NavMenus[M][] {
  return [...(navItems[menu]?.values() ?? [])].sort((a, b) => a.order - b.order);
}

export function registerNavGuardContext<K extends keyof NavGuardContext>(
  key: K,
  setup: NavGuardContextProvider<K>,
): void {
  const app = useNuxtApp();
  const providers: NavGuardContextProviders =
    navGuardProviders.get(app) ??
    new Map<keyof NavGuardContext, () => (context: NavGuardContext) => void>();
  providers.set(key, () => {
    const value = setup();
    return (context: NavGuardContext) => {
      context[key] = value.value;
    };
  });
  navGuardProviders.set(app, providers);
}

export function useNavGuardContext() {
  // Set up providers in the consuming component so they can register lifecycle hooks.
  const providers = navGuardProviders.get(useNuxtApp());
  const read = [...(providers?.values() ?? [])].map((setup) => setup());

  return computed<NavGuardContext>(() => {
    const context: NavGuardContext = {};
    for (const apply of read) apply(context);
    return context;
  });
}
