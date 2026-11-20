<script setup lang="ts">
import { authRoutes } from '#layers/auth/shared/authRoutes';

const dashboardAvailable = useRouter().getRoutes().some((record) => record.path === '/dashboard');
</script>

<template>
  <nav v-if="!dashboardAvailable" :aria-label="$t('settings.breadcrumb')" class="flex flex-wrap gap-2">
    <Button variant="outline" size="sm" as-child>
      <NuxtLink :to="authRoutes.SETTINGS_PROFILE" active-class="bg-muted">
        {{ $t('account_page.breadcrumb') }}
      </NuxtLink>
    </Button>
    <Button variant="outline" size="sm" as-child>
      <NuxtLink :to="authRoutes.SETTINGS_SECURITY" active-class="bg-muted">
        {{ $t('settings.security_breadcrumb') }}
      </NuxtLink>
    </Button>
  </nav>
</template>
