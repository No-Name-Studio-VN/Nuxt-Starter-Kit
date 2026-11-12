<template>
  <GoogleIcon v-if="provider === 'google'" class="size-full" />
  <GitHubIcon v-else-if="provider === 'github'" class="size-full fill-current" />
</template>

<script setup lang="ts">
import { GoogleIcon, GitHubIcon } from 'vue3-simple-icons';

defineProps<{
  provider: string;
}>();
</script>
