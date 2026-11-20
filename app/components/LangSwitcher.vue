<template>
  <DropdownMenu v-if="dropdownType === 'select'">
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        :size="triggerType === 'icon' ? 'icon' : 'sm'"
        class="uppercase"
        :aria-label="$t('common.lang')"
      >
        <LanguagesIcon v-if="triggerType === 'icon'" :size="18" />
        <span v-else>{{ $t('common.lang') }}</span>
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent :align="isDesktop ? 'end' : 'center'">
      <DropdownMenuItem
        v-for="l in locales"
        :key="l.code"
        :class="[
          'flex items-center gap-2 cursor-pointer transition-colors text-accent-foreground',
          currentLocale === l.code ? 'bg-accent' : '',
        ]"
        @click="updateLocale(l.code)"
      >
        <span class="flex-1 truncate">{{ l.name }}</span>
        <span v-if="currentLocale === l.code" class="ml-auto text-xs font-bold">✓</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <Popover v-else>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon" class="uppercase" :aria-label="$t('common.lang')">
        <LanguagesIcon :size="18" />
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-80 p-4" :align="isDesktop ? 'end' : 'center'">
      <div class="space-y-4">
        <div class="space-y-1">
          <h4 class="font-medium leading-none">
            {{ $t('common.lang') }}
          </h4>
          <p class="text-sm text-muted-foreground">
            {{ $t('common.locale.prompt') }}
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <Button
            v-for="l in locales"
            :key="l.code"
            variant="outline"
            size="sm"
            :class="[
              'justify-start gap-2 h-9 px-3',
              currentLocale === l.code && 'border-primary ring-1 ring-primary',
            ]"
            @click="updateLocale(l.code)"
          >
            <span class="truncate text-xs">{{ l.name }}</span>
          </Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { LanguagesIcon } from '@lucide/vue';
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core';

withDefaults(
  defineProps<{
    triggerType?: 'icon' | 'text';
    dropdownType?: 'popover' | 'select';
  }>(),
  {
    triggerType: 'icon',
    dropdownType: 'select',
  },
);

const { locale: currentLocale, locales, setLocale } = useI18n();
const breakpoints = useBreakpoints(breakpointsTailwind);
const isDesktop = breakpoints.greaterOrEqual('md');

async function updateLocale(code: string) {
  const target = locales.value.find((entry) => entry.code === code)?.code;
  if (target && target !== currentLocale.value) await setLocale(target);
}
</script>
