import '#layers/feature-flags/types/extensions';

export default defineNuxtPlugin(() => {
  registerNavGuardContext('flags', () => useFeatureFlags().flags);
});
