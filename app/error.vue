<script setup lang="ts">
import { motion } from 'motion-v';
import { ArrowLeft } from '@lucide/vue';

const error = useError();
const isNotFound = computed(() => error.value?.statusCode === 404);
const localePath = useAppLocalePath();

const handleError = () => {
  clearError({
    redirect: localePath('/') || '/',
  });
};
</script>

<template>
  <AuroraBackground>
    <motion.div
      as="div"
      :initial="{ opacity: 0, filter: 'blur(10px)' }"
      :while-in-view="{
        opacity: 1,
        filter: 'blur(0px)',
      }"
      :transition="{
        duration: 0.3,
        ease: 'easeInOut',
      }"
    >
      <MaxWidthWrapper
        class="h-screen relative flex flex-col items-center justify-center gap-4 px-4"
      >
        <h1
          v-if="error"
          class="text-8xl font-bold tracking-tighter text-foreground/10 md:text-[180px] lg:text-[250px] leading-none text-center"
        >
          {{ error.statusCode }}
        </h1>
        <h2
          v-if="error"
          class="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-center"
        >
          {{ $t(isNotFound ? 'errors.page_not_found' : 'errors.unexpected') }}
        </h2>
        <p class="text-lg text-muted-foreground text-center">
          {{
            $t(isNotFound ? 'errors.page_not_found_description' : 'errors.unexpected_description')
          }}
        </p>
        <div class="mt-4 flex items-center justify-center gap-4">
          <Button @click="handleError">
            <ArrowLeft class="size-4" />
            {{ $t('common.go_home') }}
          </Button>
        </div>
      </MaxWidthWrapper>
    </motion.div>
  </AuroraBackground>
</template>
