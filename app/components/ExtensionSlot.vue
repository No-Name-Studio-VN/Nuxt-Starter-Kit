<script setup lang="ts">
import { computed } from 'vue';
import type { Ref } from 'vue';
import type { ExtensionSlotName } from '~~/types/extensions';

const props = defineProps<{
  name: ExtensionSlotName;
}>();

defineOptions({ inheritAttrs: false });

const availability = new Map<string, Readonly<Ref<boolean>>>();
for (const entry of getExtensions(props.name)) {
  if (entry.useAvailable) availability.set(entry.id, entry.useAvailable());
}

const entries = computed(() =>
  getExtensions(props.name).filter((entry) => availability.get(entry.id)?.value ?? true),
);
</script>

<template>
  <slot v-if="entries.length === 0" />
  <template v-for="(entry, index) in entries" :key="entry.id">
    <slot v-if="index > 0" name="between" />
    <component :is="entry.component" v-bind="$attrs" />
  </template>
  <slot v-if="entries.length" name="after" />
</template>
