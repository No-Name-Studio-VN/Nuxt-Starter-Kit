<script setup lang="ts">
import { KeyRound } from '@lucide/vue';
import { DiscordIcon, GitHubIcon, GoogleIcon } from 'vue3-simple-icons';
import type { OAuthProviderIcon } from '#layers/auth-oauth/types/providers';

const icons = {
  google: GoogleIcon,
  github: GitHubIcon,
  discord: DiscordIcon,
  'key-round': KeyRound,
};

defineProps<{ icon: OAuthProviderIcon }>();
</script>

<template>
  <component :is="icons[icon]" aria-hidden="true" class="size-full" />
</template>
