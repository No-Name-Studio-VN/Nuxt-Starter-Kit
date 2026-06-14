<template>
  <GoogleIcon
    v-if="provider === 'google'"
    aria-hidden="true"
    class="w-full h-full"
  />
  <GitHubIcon
    v-else-if="provider === 'github'"
    aria-hidden="true"
    class="w-full h-full fill-current"
  />
</template>

<script setup lang="ts">
import { GoogleIcon, GitHubIcon } from 'vue3-simple-icons'

defineProps<{
  provider: string
}>()
</script>
