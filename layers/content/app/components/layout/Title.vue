<template>
  <div class="mb-8">
    <ProseH1>
      {{ title }}
    </ProseH1>
    <CtMDC v-if="description" :value="description" class="text-muted-foreground pt-1 text-lg" />

    <div v-if="badges" class="flex gap-2 pt-4">
      <template v-for="(badge, i) in badges" :key="i">
        <NuxtLinkLocale v-if="badge.to" :to="badge.to" :target="badge.target">
          <Badge
            :variant="badgeVariant(badge.variant) ?? 'secondary'"
            :type="badge.type"
            class="gap-1 rounded-md"
          >
            {{ badge.value }}
            <CtIcon :size="12" :name="badge.icon || 'lucide:external-link'" />
          </Badge>
        </NuxtLinkLocale>
        <Badge
          v-else
          :variant="badgeVariant(badge.variant) ?? 'secondary'"
          :type="badge.type"
          class="gap-1 rounded-md"
        >
          {{ badge.value }}
          <CtIcon v-if="badge.icon" :size="12" :name="badge.icon" />
        </Badge>
      </template>
    </div>

    <div v-if="authors" class="-mx-4 flex divide-x pt-4">
      <template v-for="author in authors" :key="author.name">
        <NuxtLinkLocale
          v-if="author.to"
          :to="author.to"
          :target="author.target"
          class="flex items-center gap-2 px-4"
        >
          <Avatar v-if="author.avatar" class="size-8">
            <AvatarImage :src="author.avatar" :alt="author.name" />
          </Avatar>
          <div>
            <div class="text-sm font-semibold">
              {{ author.name }}
            </div>
            <div v-if="author.username" class="text-muted-foreground text-xs/4 font-medium">
              @{{ author.username }}
            </div>
          </div>
        </NuxtLinkLocale>
        <div v-else class="flex items-center gap-2 px-4">
          <Avatar v-if="author.avatar" class="size-8">
            <AvatarImage :src="author.avatar" :alt="author.name" />
          </Avatar>
          <div>
            <div class="text-sm font-semibold">
              {{ author.name }}
            </div>
            <div v-if="author.username" class="text-muted-foreground text-xs/4 font-medium">
              @{{ author.username }}
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import CtIcon from '#layers/content/app/components/content/CtIcon.vue';
import type { ContentCollectionItem } from '@nuxt/content';

defineProps<{
  title?: string;
  description?: string;
  badges?: ContentCollectionItem['badges'];
  authors?: ContentCollectionItem['authors'];
}>();
</script>
