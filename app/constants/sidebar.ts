import type { SidebarItem } from '~~/types/common'
import {
  Home,
  UserCog2Icon,
} from 'lucide-vue-next'

export const SIDEBAR_LINKS: { navMain: SidebarItem[], navSecondary: SidebarItem[] } = {
  navMain: [
    {
      title: 'Home',
      url: '/',
      icon: Home,
    },
  ],
  navSecondary: [
    {
      title: 'Support',
      url: '/support',
      icon: UserCog2Icon,
    },
  ],
}
