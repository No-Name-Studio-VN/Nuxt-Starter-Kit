<script setup lang="ts">
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useSidebar } from '@/components/ui/sidebar/utils';
import type { SidebarItem } from '~~/types/common';

defineProps<{
  items: SidebarItem[];
}>();

const { isMobile, setOpenMobile } = useSidebar();
const { clearSidebarContextOverride } = useSidebarContext();

const handleNavigationClick = () => {
  clearSidebarContextOverride();

  if (isMobile.value) {
    setOpenMobile(false);
  }
};
</script>

<template>
  <SidebarGroup>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="item in items" :key="item.title">
          <SidebarMenuButton as-child size="sm">
            <nuxt-link :to="item.url" @click="handleNavigationClick">
              <component :is="item.icon" />
              <span>{{ item.title }}</span>
            </nuxt-link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
