<template>
  <footer class="text-muted-foreground py-6 md:px-8 md:py-0">
    <div class="container flex flex-col items-center justify-between gap-2 md:h-24 md:flex-row">
      <CtMDC :value="credits" class="flex items-center" />
      <span class="flex-1" />
      <div class="flex flex-wrap gap-2 justify-center md:justify-end">
        <NuxtLinkLocale
          v-for="(link, i) in footer.links"
          :key="i"
          :to="link?.to"
          :target="link?.target"
          :aria-label="
            link.title ? ($te(link.title) ? $t(link.title) : link.title) : iconLabel(link.icon)
          "
        >
          <Button
            variant="ghost"
            :size="link?.icon && !link?.title ? 'icon' : 'default'"
            class="flex gap-2"
          >
            <CtIcon v-if="link?.icon" :name="link.icon" :size="20" />
            <span v-if="link?.title">{{ $te(link.title) ? $t(link.title) : link.title }}</span>
          </Button>
        </NuxtLinkLocale>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import CtIcon from '#layers/content/app/components/content/CtIcon.vue';

const { t, te } = useI18n();
const { footer } = useDocsConfig().value;
function iconLabel(icon?: string) {
  if (icon === 'lucide:mail') return t('common.email');
  if (icon === 'lucide:github') return 'GitHub';
  if (icon === 'lucide:twitter') return 'X (Twitter)';
  return undefined;
}

const credits = computed(() => {
  const key = footer.credits === 'copyright' ? 'footer.copyright' : footer.credits;
  return key && te(key) ? t(key, { year: new Date().getFullYear() }) : footer.credits;
});
</script>
