<script setup lang="ts">
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
const localePath = useAppLocalePath();
</script>

<template>
  <p class="text-center text-sm text-muted-foreground">
    {{ $t('auth_password.no_account') }}
    <NuxtLink
      :to="localePath(passwordRoutes.AUTH_REGISTER)"
      class="font-medium text-foreground underline-offset-4 hover:underline"
    >
      {{ $t('auth_password.sign_up') }}
    </NuxtLink>
  </p>
</template>
