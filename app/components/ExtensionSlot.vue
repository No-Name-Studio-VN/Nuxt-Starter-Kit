<script setup lang="ts">
import { computed } from 'vue';
import type { ExtensionSlotName } from '~~/types/extensions';

const props = defineProps<{
  name: ExtensionSlotName;
}>();

defineOptions({ inheritAttrs: false });

const entries = computed(() => getExtensions(props.name));
</script>

<template>
  <slot v-if="entries.length === 0" />
  <component :is="entry.component" v-for="entry in entries" :key="entry.id" v-bind="$attrs" />
</template>
