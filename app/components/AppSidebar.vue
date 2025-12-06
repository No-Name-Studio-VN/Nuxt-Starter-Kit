<script setup lang="ts">
import NavMain from '@/components/nav/NavMain.vue'
import NavSecondary from '@/components/nav/NavSecondary.vue'
import NavUser from '@/components/nav/NavUser.vue'
import type { SidebarProps } from '@/components/ui/sidebar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar'
import { useSidebar } from '@/components/ui/sidebar/utils'
import { SIDEBAR_LINKS } from '@/constants/sidebar'

import InstallPrompter from './InstallPrompter.vue'
import { Separator } from './ui/separator'

const props = withDefaults(defineProps<SidebarProps>(), {
  variant: 'inset',
})

const { open } = useSidebar()
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <NavUser />
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="SIDEBAR_LINKS.navMain" />
      <NavSecondary
        :items="SIDEBAR_LINKS.navSecondary"
        class="mt-auto"
      />
    </SidebarContent>
    <Separator />
    <SidebarFooter>
      <InstallPrompter :sidebar-open="open" />
    </SidebarFooter>
  </Sidebar>
</template>
