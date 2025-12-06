import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export function useBreadcrumbs() {
  const route = useRoute()
  const router = useRouter()

  const pathBreadcrumbs = computed<BreadcrumbItem[]>(() => {
    const path = route.path
    const crumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/' }]

    if (path === '/') return crumbs

    const segments = path.split('/').filter(Boolean)
    let currentPath = ''

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`

      // Try to find a matching route record to get meta
      const match = router.resolve(currentPath)

      let label = segment
      if (match && match.meta && (match.meta.breadcrumb || match.meta.title)) {
        label = (match.meta.breadcrumb as string) || (match.meta.title as string)
      }
      else {
        // Capitalize
        label = segment.charAt(0).toUpperCase() + segment.slice(1)
      }

      // If it's the last segment, it matches the current route
      // We can check if the current route has specific meta that overrides the segment name
      if (index === segments.length - 1) {
        if (route.meta.breadcrumb || route.meta.title) {
          label = (route.meta.breadcrumb as string) || (route.meta.title as string)
        }
      }

      crumbs.push({
        label,
        href: currentPath,
      })
    })

    return crumbs
  })

  return {
    breadcrumbs: pathBreadcrumbs,
  }
}
