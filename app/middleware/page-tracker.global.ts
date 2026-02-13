import { storeCurrentPage } from '@/composables/usePageTracker'

export default defineNuxtRouteMiddleware((to) => {
  if (to.meta.noPageTrack) {
    console.log('Ignored')
  }
  else {
    storeCurrentPage(to.fullPath || to.path)
  }
  return
})
