<script setup lang="ts">
import { ChevronsUpDown, LogOut, SunMoon, Settings, LogIn, UserIcon, UsersIcon } from '@lucide/vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import ThemeSwitcher from '@/components/ThemeSwitcher.vue';
import { useSidebar } from '@/components/ui/sidebar/utils';

const { user, clear, loggedIn } = useUserSession();
const { isMobile, setOpenMobile } = useSidebar();
const { clearSidebarContextOverride } = useSidebarContext();

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function logout() {
  clear().then(() => {
    location.reload();
  });
}

function navigateFromSidebar(path: string) {
  clearSidebarContextOverride();

  if (isMobile.value) {
    setOpenMobile(false);
  }

  return navigateTo(path);
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <SidebarMenuButton
        size="lg"
        class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
      >
        <!--
          On prerendered routes the session only lands after mount, so reading
          `user` immediately would render "Sign In" under a signed-in reader's
          own name. AuthState keeps the row on skeletons until it is known.
          AuthState renders a fragment, so these stay direct children of
          SidebarMenuButton and its layout classes still apply.
        -->
        <AuthState>
          <template v-if="user">
            <Avatar class="size-8 rounded-lg">
              <AvatarImage src="/images/avatar/default.png" :alt="user.name" />
              <AvatarFallback class="rounded-lg">
                {{ getInitials(user.name) }}
              </AvatarFallback>
            </Avatar>
            <div class="grid flex-1 text-left text-sm/tight">
              <span class="truncate font-medium">{{ user.name }}</span>
              <span class="truncate text-xs">{{ user.username }}</span>
            </div>
            <ChevronsUpDown class="ml-auto size-4" />
          </template>
          <template v-else>
            <span class="font-medium">Sign In</span>
            <ChevronsUpDown class="ml-auto size-4" />
          </template>

          <template #placeholder>
            <Skeleton class="size-8 shrink-0 rounded-lg" />
            <div class="grid flex-1 gap-1.5">
              <Skeleton class="h-3.5 w-24 max-w-full" />
              <Skeleton class="h-3 w-16 max-w-full" />
            </div>
            <ChevronsUpDown class="ml-auto size-4" />
          </template>
        </AuthState>
      </SidebarMenuButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      class="w-[--reka-dropdown-menu-trigger-width] min-w-56 rounded-lg"
      side="bottom"
      align="end"
      :side-offset="4"
    >
      <DropdownMenuGroup>
        <DropdownMenuItem v-if="user?.isAdmin" @click="navigateFromSidebar('/admin')">
          <UsersIcon />
          Admin
        </DropdownMenuItem>
        <DropdownMenuItem v-if="loggedIn" @click="navigateFromSidebar('/settings/account')">
          <UserIcon />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem v-else @click="navigateFromSidebar('/auth/login')">
          <LogIn />
          Sign In
        </DropdownMenuItem>
        <DropdownMenuItem @click="navigateFromSidebar('/settings')">
          <Settings />
          Settings
        </DropdownMenuItem>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunMoon />
            Appearance
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <ThemeSwitcher />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuGroup>

      <DropdownMenuItem
        v-if="loggedIn"
        class="hover:bg-red-500/10 focus:bg-red-500/10 hover:text-red-600 focus:text-red-600"
        @click="logout"
      >
        <LogOut />
        Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
