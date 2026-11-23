<template>
  <Breadcrumb>
    <BreadcrumbList>
      <template v-for="(breadcrumb, index) in breadcrumbs" :key="breadcrumb.title">
        <BreadcrumbItem>
          <NuxtLinkLocale
            v-if="breadcrumbTarget(index, breadcrumb.href)"
            :to="breadcrumbTarget(index, breadcrumb.href)!"
            class="hover:text-foreground transition-colors"
            :class="{ 'text-foreground': index === breadcrumbs.length - 1 }"
          >
            {{ breadcrumb.title }}
          </NuxtLinkLocale>
          <span
            v-else
            class="transition-colors"
            :class="{ 'text-foreground': index === breadcrumbs.length - 1 }"
          >
            {{ breadcrumb.title }}
          </span>
        </BreadcrumbItem>
        <BreadcrumbSeparator v-if="index !== breadcrumbs.length - 1" />
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>

<script setup lang="ts">
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb';

const { navigation, path } = useI18nDocs();
const breadcrumbs = computed(() => useBreadcrumb(path.value, navigation.value));

function breadcrumbTarget(index: number, href: string | undefined) {
  if (index === 0 || !href) return undefined;
  return navTargetFromPath(href, navigation.value);
}
</script>
