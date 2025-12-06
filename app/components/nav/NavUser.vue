<script setup lang="ts">
import { ChevronsUpDown, LogOut, SunMoon, Settings, LogIn, UserIcon, UsersIcon } from 'lucide-vue-next'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import type { User } from '~~/server/utils/db'

const { user, clear } = useUserSession()

const defaultUser = {
  name: 'Guest User',
  username: 'guest',
  avatar: '/images/avatar/default.png',
} as const

const isAuthenticated = computed(() => !!user.value)

const {
  data: fetchedUser,
  refresh: refreshUser,
} = useFetch<User>('/api/users/me', {
  immediate: isAuthenticated.value,
  watch: false,
})

// Refresh user data when authentication state changes
watch(isAuthenticated, async (authenticated) => {
  if (authenticated) {
    await refreshUser()
  }
})

const displayUser = computed(() => fetchedUser.value ?? user.value ?? defaultUser)
const userInitial = computed(() =>
  isAuthenticated.value ? displayUser.value.name?.charAt(0).toUpperCase() : 'G',
)

async function logout() {
  await clear()
}
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Avatar class="h-8 w-8 rounded-lg">
              <AvatarImage
                :src="defaultUser.avatar"
                :alt="displayUser.name"
              />
              <AvatarFallback class="rounded-lg">
                {{ userInitial }}
              </AvatarFallback>
            </Avatar>
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">{{ displayUser.name }}</span>
              <span class="truncate text-xs">{{ displayUser.username }}</span>
            </div>
            <ChevronsUpDown class="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-[--reka-dropdown-menu-trigger-width] min-w-56 rounded-lg"
          side="bottom"
          align="end"
          :side-offset="4"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              v-if="fetchedUser?.isAdmin"
              @click="navigateTo('/admin')"
            >
              <UsersIcon />
              Admin
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="isAuthenticated"
              @click="navigateTo('/settings/account')"
            >
              <UserIcon />
              Account
            </DropdownMenuItem>
            <DropdownMenuItem
              v-else
              @click="navigateTo('/auth/login')"
            >
              <LogIn />
              Sign In
            </DropdownMenuItem>
            <DropdownMenuItem @click="navigateTo('/settings')">
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
            v-if="isAuthenticated"
            class="hover:bg-red-500/10 focus:bg-red-500/10 hover:text-red-600 focus:text-red-600"
            @click="logout"
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
