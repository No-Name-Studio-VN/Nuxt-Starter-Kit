import { storeCurrentPage } from '@/composables/usePageTracker'

export default defineNuxtRouteMiddleware((to) => {
  if (to.meta?.track === false) return
  storeCurrentPage(to.fullPath || to.path)
})
