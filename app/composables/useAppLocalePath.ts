import type { Locale } from '~~/types/i18n';

export function useAppLocalePath() {
  const localePath = useLocalePath();
  const router = useRouter();

  return (path: string, locale?: Locale) => {
    // Nuxt i18n 10.6 only resolves localized names, even for disabled routes.
    if (path.startsWith('/') && !path.startsWith('//') && router.resolve(path).meta.localeIndependent === true) {
      return path;
    }
    return localePath(path, locale);
  };
}

export function useAppSwitchLocalePath() {
  const switchLocalePath = useSwitchLocalePath();
  const route = useRoute();

  return (locale: Locale) =>
    route.meta.localeIndependent === true ? route.fullPath : switchLocalePath(locale);
}
