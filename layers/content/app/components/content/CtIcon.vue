<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{ name?: string | Component; size?: number; class?: string }>();
</script>

<template>
  <SiteIcon :name="name" :size="size" :class="$props.class" />
</template>
