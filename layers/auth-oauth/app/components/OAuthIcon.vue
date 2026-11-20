<script setup lang="ts">
import { KeyRound } from '@lucide/vue';
import type { OAuthProviderIcon } from '#layers/auth-oauth/types/providers';
import { DiscordIcon, GitHubIcon, GoogleIcon } from 'vue3-simple-icons';

defineProps<{
  icon: OAuthProviderIcon;
  brandColors?: boolean;
}>();
</script>

<template>
  <svg v-if="icon === 'google' && brandColors" viewBox="0 0 24 24" class="size-full" aria-hidden="true">
    <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5 5 0 0 1-2.2 3.3v2.8h3.6c2-1.9 3.2-4.7 3.2-8.1z" />
    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.7 14c-.2-.7-.3-1.2-.3-2s.1-1.4.3-2V7.1H2A11 11 0 0 0 1 12c0 1.8.4 3.4 1.2 4.9L5.7 14z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10c.9-2.6 3.4-4.6 6.3-4.6z" />
  </svg>
  <GoogleIcon v-else-if="icon === 'google'" class="size-full" aria-hidden="true" />
  <GitHubIcon v-else-if="icon === 'github'" class="size-full fill-current" aria-hidden="true" />
  <DiscordIcon v-else-if="icon === 'discord'" class="size-full fill-current" aria-hidden="true" />
  <KeyRound v-else class="size-full" aria-hidden="true" />
</template>
