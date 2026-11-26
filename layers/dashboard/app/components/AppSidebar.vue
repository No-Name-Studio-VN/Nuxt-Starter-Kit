<script setup lang="ts">
import { ArrowLeft, SearchIcon } from '@lucide/vue';

import NavMain from '#layers/dashboard/app/components/nav/NavMain.vue';
import NavSecondary from '#layers/dashboard/app/components/nav/NavSecondary.vue';
import type { SidebarProps } from '@/components/ui/sidebar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { useSidebar } from '@/components/ui/sidebar/utils';

import { Separator } from '@/components/ui/separator';

const props = withDefaults(defineProps<SidebarProps>(), {
  variant: 'inset',
});

const { toggleIsOpen } = useHotSearch();
const { open } = useSidebar();
const {
  primarySections,
  secondarySections,
  showBack,
  showMainSidebar,
  clearSidebarContextOverride,
} = useSidebarContext();
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <SidebarMenu class="space-y-2">
        <ExtensionSlot name="sidebar:user" @navigate="clearSidebarContextOverride" />
        <SidebarMenuItem>
          <SidebarMenuButton
            as-child
            :tooltip="$t('nav.quick_search')"
            class="flex items-center"
            @click="toggleIsOpen()"
          >
            <Button variant="outline" class="w-full" size="lg">
              <SearchIcon />
              <span>{{ $t('nav.quick_search') }}</span>
              <KbdGroup class="ml-auto">
                <Kbd>Ctrl</Kbd>
                <span>+</span>
                <Kbd>K</Kbd>
              </KbdGroup>
            </Button>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarSeparator />
    </SidebarHeader>

    <SidebarContent class="overflow-hidden grid relative">
      <div class="w-full flex flex-col gap-0 overflow-y-auto" style="grid-area: 1 / 1">
        <SidebarGroup v-if="showBack">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                :tooltip="$t('common.back')"
                class="flex items-center"
                @click="showMainSidebar"
              >
                <ArrowLeft />
                <span>{{ $t('common.back') }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <NavMain
          v-for="section in primarySections"
          :key="section.title"
          :title="$te(section.title) ? $t(section.title) : section.title"
          :items="section.items"
        />
        <NavSecondary
          v-for="section in secondarySections"
          :key="section.title"
          class="mt-auto"
          :items="section.items"
        />
      </div>
    </SidebarContent>

    <Separator />
    <SidebarFooter>
      <ExtensionSlot name="sidebar:footer" :sidebar-open="open" />
    </SidebarFooter>
  </Sidebar>
</template>
