<template>
  <CtCodeBlock
    :code="code"
    :language="language"
    :filename="filename"
    :highlights="highlights"
    :meta="meta"
  >
    <pre :class="$props.class" :style="style"><slot /></pre>
  </CtCodeBlock>
</template>

<script setup lang="ts">
import type { BuiltinLanguage } from "shiki";

withDefaults(defineProps<{
  code?: string;
  language?: BuiltinLanguage;
  filename?: string;
  highlights?: number[];
  meta?: string;
  class?: string;
  style?: string | Record<string, string | number>;
}>(), { code: '', highlights: () => [] });
</script>

<style>
pre code .line {
  display: block;
  min-height: 1rem;
}
</style>
