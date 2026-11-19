<script setup lang="ts">
import { LogInIcon } from '@lucide/vue';
import { authRoutes } from '#layers/auth/shared/authRoutes';

const { loggedIn, user } = useUserSession();
</script>

<template>
  <Button
    v-if="!loggedIn || !user"
    variant="default"
    size="sm"
    @click="navigateTo(authRoutes.AUTH_LOGIN)"
  >
    <LogInIcon />
    <span class="hidden sm:flex">Sign In</span>
  </Button>
</template>
