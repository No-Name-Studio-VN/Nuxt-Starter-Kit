<template>
  <div>
    <header
      class="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 transition-all duration-300 ease-out"
      :class="isScrolled ? 'h-12' : 'h-16'"
    >
      <div class="container mx-auto flex h-full items-center justify-between px-4">
        <!-- Logo -->
        <NuxtLink
          to="/"
          class="flex items-center gap-2 group transition-transform duration-300"
          :class="isScrolled ? 'scale-90' : 'scale-100'"
        >
          <NuxtImg
            src="/favicon.svg"
            alt="Logo"
            class="h-8 w-8 transition-all duration-300"
            :class="isScrolled ? 'h-6 w-6' : 'h-8 w-8'"
          />
          <span class="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {{ APP_MANIFEST.name }}
          </span>
        </NuxtLink>

        <!-- Desktop Navigation -->
        <nav class="hidden md:flex items-center gap-1">
          <Button
            v-for="item in navItems"
            :key="item.sectionId"
            variant="ghost"
            class="cursor-pointer"
            @click="scrollToSection(item.sectionId)"
          >
            {{ item.label }}
          </Button>
        </nav>

        <!-- Mobile Menu Trigger -->
        <Sheet v-model:open="isSheetOpen">
          <SheetTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="md:hidden relative"
              aria-label="Open menu"
            >
              <Menu
                class="h-5 w-5 transition-transform duration-300"
                :class="{ 'rotate-90 opacity-0': isSheetOpen, 'rotate-0 opacity-100': !isSheetOpen }"
              />
            </Button>
          </SheetTrigger>

          <!-- Mobile Navigation Sheet -->
          <SheetContent
            side="right"
            class="w-full max-w-xs sm:max-w-sm"
          >
            <SheetHeader class="text-left">
              <SheetTitle class="flex items-center gap-2">
                <NuxtImg
                  src="/favicon.svg"
                  alt="Logo"
                  class="h-8 w-8 transition-all duration-300"
                  :class="isScrolled ? 'h-6 w-6' : 'h-8 w-8'"
                />
                <span class="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">{{ APP_MANIFEST.name }}</span>
              </SheetTitle>
            </SheetHeader>
            <nav class="flex flex-col gap-2 p-4 pt-0">
              <a
                v-for="item in navItems"
                :key="item.sectionId"
                :href="`#${item.sectionId}`"
                class="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-[0.98]"
                @click.prevent="handleMobileNavClick(item.sectionId)"
              >
                <component
                  :is="item.icon"
                  class="h-5 w-5"
                />
                {{ item.label }}
              </a>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>

    <main class="flex flex-1 flex-col">
      <div class="mx-auto h-full w-full max-w-[1400px] min-[1800px]:max-w-[1536px] min-h-[90vh]">
        <slot />
      </div>
    </main>

    <footer class="border-t border-border bg-muted/30">
      <div class="container mx-auto px-4 py-8">
        <div class="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p class="text-sm text-muted-foreground">
            © {{ new Date().getFullYear() }} {{ SEO_CONFIG.author }}. All rights reserved.
          </p>
          <div class="flex items-center gap-6">
            <NuxtLink
              to="/privacy"
              class="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy
            </NuxtLink>
            <NuxtLink
              to="/terms"
              class="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms
            </NuxtLink>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWindowScroll } from '@vueuse/core'
import { APP_MANIFEST, SEO_CONFIG } from '@/constants/manifest'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Home, Search, Users, Phone, Layers, Menu } from 'lucide-vue-next'

const router = useRouter()
const isSheetOpen = ref(false)

// Scroll detection for shrinking header effect
const { y: scrollY } = useWindowScroll()
const isScrolled = computed(() => scrollY.value > 50)

// Navigation items with lucide icons and section IDs
const navItems = [
  {
    label: 'Trang chủ',
    sectionId: 'home',
    icon: Home,
  },
  {
    label: 'Tìm kiếm',
    sectionId: 'search',
    icon: Search,
  },
  {
    label: 'Về chúng tôi',
    sectionId: 'about',
    icon: Users,
  },
  {
    label: 'Liên hệ',
    sectionId: 'contact',
    icon: Phone,
  },
]

// Function to scroll to section with smooth animation
const scrollToSection = (sectionId: string) => {
  // If we're not on the homepage, navigate there first
  if (router.currentRoute.value.path !== '/') {
    router.push('/').then(() => {
      // Wait for navigation to complete, then scroll
      setTimeout(() => {
        scrollToElement(sectionId)
      }, 100)
    })
  }
  else {
    scrollToElement(sectionId)
  }
}

const scrollToElement = (sectionId: string) => {
  const element = document.getElementById(sectionId)
  if (element) {
    const headerOffset = 80 // Account for fixed header height
    const elementPosition = element.getBoundingClientRect().top
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth',
    })
  }
}

// Handle mobile nav click - close sheet and scroll
const handleMobileNavClick = (sectionId: string) => {
  isSheetOpen.value = false
  // Small delay to allow sheet to close
  setTimeout(() => {
    scrollToSection(sectionId)
  }, 300)
}
</script>
