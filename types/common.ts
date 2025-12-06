export enum DeviceType {
  Mobile = 'mobile',
  Tablet = 'tablet',
  Desktop = 'desktop',
}

export type SidebarItem = {
  title: string
  url: string
  icon?: Component
  items?: SidebarItem[]
}
