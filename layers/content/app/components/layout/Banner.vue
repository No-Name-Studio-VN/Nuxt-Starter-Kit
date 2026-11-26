<template>
  <Transition>
    <div
      v-if="open"
      class="block transition-colors"
      :class="{ 'hover:bg-muted/40 hover:cursor-pointer': to, 'border-b': border }"
      @click="navigate"
    >
      <div class="container flex h-12 max-w-screen-2xl items-center justify-between">
        <div class="hidden lg:block" />
        <div class="text-sm">
          <CtMDC :value="bannerText" class="flex items-center" />
        </div>
        <Button
          v-if="showClose"
          variant="ghost"
          class="z-40 size-8 p-2"
          :aria-label="$t('common.dismiss')"
          @click.stop="open = false"
        >
          <XIcon />
        </Button>
        <div v-else />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { APP_MANIFEST } from '#shared/constants/manifest';
import { XIcon } from '@lucide/vue';

const open = useCookie<boolean>('banner-open', { default: () => true });
const { showClose, content, to, target, border } = useDocsConfig().value.banner;

const { t, te } = useI18n();
const bannerText = computed(() =>
  te(content) ? t(content, { site: APP_MANIFEST.name }) : content,
);

function navigate() {
  const localePath = useLocalePath();

  if (open.value && to) {
    navigateTo(localePath(to), {
      external: true,
      open: {
        target: target ?? '_blank',
      },
    });
  }
}
</script>

<style scoped>
.v-enter-active,
.v-leave-active {
  transition: opacity 0.3s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
