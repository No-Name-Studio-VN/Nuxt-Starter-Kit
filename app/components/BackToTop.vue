<template>
  <!-- Back to Top Button -->
  <Transition
    enter-active-class="transition-all duration-300"
    leave-active-class="transition-all duration-300"
    enter-from-class="opacity-0 scale-75 translate-y-4"
    leave-to-class="opacity-0 scale-75 translate-y-4"
  >
    <Button
      v-if="showBackToTop"
      class="fixed bottom-8 right-8 rounded-full w-12 h-12 shadow-lg hover:shadow-xl z-50 bg-primary hover:bg-primary/90"
      size="icon"
      @click="scrollToTop"
    >
      <ArrowUp class="w-5 h-5" />
    </Button>
  </Transition>
</template>

<script lang="ts" setup>
import { ArrowUp } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'

import { Button } from './ui/button'

const showBackToTop = ref(false)
const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  const handleScroll = () => {
    showBackToTop.value = window.scrollY > 300
  }

  window.addEventListener('scroll', handleScroll)

  return () => {
    window.removeEventListener('scroll', handleScroll)
  }
})
</script>
