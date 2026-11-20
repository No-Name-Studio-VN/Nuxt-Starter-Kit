<script setup lang="ts">
import { LanguagesIcon } from '@lucide/vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { languageNames } from '~~/i18n-constants';
import { normalizeLocale } from '#shared/utils/locales';

const { locale, defaultLocale } = useI18n();
</script>

<template>
  <Alert role="status">
    <LanguagesIcon aria-hidden="true" />
    <AlertDescription>
      <p>
        {{ $t('docs.translation_fallback', {
          requestedLanguage: languageNames[normalizeLocale(locale)],
          fallbackLanguage: languageNames[normalizeLocale(defaultLocale)],
        }) }}
      </p>
    </AlertDescription>
  </Alert>
</template>
