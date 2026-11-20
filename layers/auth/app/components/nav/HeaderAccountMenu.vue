<script setup lang="ts">
import { CircleUserRound, LogOut, Settings } from '@lucide/vue';
import { toast } from 'vue-sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authRoutes } from '#layers/auth/shared/authRoutes';

const { loggedIn, clear } = useUserSession();
const { t } = useI18n();
const localePath = useAppLocalePath();
const signingOut = ref(false);

async function signOut() {
  signingOut.value = true;
  try {
    await clear();
    location.reload();
  } catch {
    toast.error(t('onboarding.sign_out_failed'));
    signingOut.value = false;
  }
}
</script>

<template>
  <DropdownMenu v-if="loggedIn">
    <DropdownMenuTrigger as-child>
      <Button type="button" variant="ghost" size="icon" :disabled="signingOut">
        <CircleUserRound aria-hidden="true" />
        <span class="sr-only">{{ t('settings.breadcrumb') }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem as-child>
        <NuxtLink :to="localePath(authRoutes.SETTINGS_PROFILE)">
          <Settings aria-hidden="true" />
          {{ t('settings.breadcrumb') }}
        </NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem :disabled="signingOut" @select="signOut">
        <LogOut aria-hidden="true" />
        {{ t('common.log_out') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
