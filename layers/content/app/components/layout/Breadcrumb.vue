<template>
  <Breadcrumb>
    <BreadcrumbList>
      <template v-for="(breadcrumb, index) in breadcrumbs" :key="breadcrumb.title">
        <BreadcrumbItem>
          <NuxtLinkLocale
            :href="index === 0 ? undefined : navTargetFromPath(breadcrumb.href, navigation)"
            class="hover:text-foreground transition-colors"
            :class="{ 'text-foreground': index === breadcrumbs.length - 1 }"
          >
            {{ breadcrumb.title }}
          </NuxtLinkLocale>
        </BreadcrumbItem>
        <BreadcrumbSeparator v-if="index !== breadcrumbs.length - 1" />
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>

<script setup lang="ts">
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbSeparator } from '~/components/ui/breadcrumb';

const { navigation, path } = useI18nDocs();
const breadcrumbs = computed(() => useBreadcrumb(path.value, navigation.value));
</script>
