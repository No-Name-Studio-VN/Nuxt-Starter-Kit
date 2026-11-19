<script setup lang="ts">
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
</script>

<template>
  <p class="text-center text-sm text-muted-foreground">
    Don't have an account?
    <NuxtLink
      :to="passwordRoutes.AUTH_REGISTER"
      class="font-medium text-foreground underline-offset-4 hover:underline"
    >
      Sign up
    </NuxtLink>
  </p>
</template>
