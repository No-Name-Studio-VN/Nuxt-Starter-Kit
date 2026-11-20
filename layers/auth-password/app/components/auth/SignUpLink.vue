<script setup lang="ts">
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
const localePath = useAppLocalePath();
</script>

<template>
  <p class="text-center text-sm text-muted-foreground">
    Don't have an account?
    <NuxtLink
      :to="localePath(passwordRoutes.AUTH_REGISTER)"
      class="font-medium text-foreground underline-offset-4 hover:underline"
    >
      Sign up
    </NuxtLink>
  </p>
</template>
