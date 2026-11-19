<script setup lang="ts">
import { LogIn, LogOut } from '@lucide/vue';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { authRoutes } from '#layers/auth/shared/authRoutes';

defineOptions({ inheritAttrs: false });

const { loggedIn, clear } = useUserSession();

async function logout() {
  await clear();
  location.reload();
}
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <Button v-if="loggedIn" class="w-full" variant="destructive" @click="logout">
        <LogOut class="size-4" />
        {{ $t('common.log_out') }}
      </Button>
      <Button v-else class="w-full" @click="navigateTo(authRoutes.AUTH_LOGIN)">
        <LogIn class="size-4" />
        {{ $t('common.sign_in') }}
      </Button>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
