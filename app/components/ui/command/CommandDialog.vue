<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from 'reka-ui'
import { useForwardPropsEmits } from 'reka-ui'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import Command from './Command.vue'

const props = defineProps<DialogRootProps & {
  title?: string
  description?: string
}>()
const emits = defineEmits<DialogRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <Dialog v-bind="forwarded">
    <DialogContent class="overflow-hidden p-0">
      <DialogHeader class="sr-only">
        <DialogTitle>{{ title ?? $t('common.command_palette') }}</DialogTitle>
        <DialogDescription>{{ description ?? $t('common.command_palette_description') }}</DialogDescription>
      </DialogHeader>
      <Command>
        <slot />
      </Command>
    </DialogContent>
  </Dialog>
</template>
