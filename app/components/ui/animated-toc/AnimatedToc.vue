<script setup lang="ts">
// Vendored from nxui's animated-toc registry. One SVG rail connects every row;
// the dot follows its arc length rather than cutting across indentation bends.
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import { usePreferredReducedMotion, useRafFn } from '@vueuse/core';
import { FileTextIcon } from '@lucide/vue';
import { cn } from '@/lib/utils';
import type { AnimatedTocProps } from './types';

const props = withDefaults(defineProps<AnimatedTocProps>(), {
  rowHeight: 32,
  indent: 24,
  title: 'On this page',
  ariaLabel: 'On this page',
  progressBar: true,
  class: '',
});
const active = defineModel<number>({ default: 0 });
const emit = defineEmits<{ select: [index: number, event: MouseEvent] }>();
const reducedMotion = usePreferredReducedMotion();
const RAIL_X = 8;

const xOf = (i: number) => RAIL_X + (props.items[i]?.depth ?? 0) * props.indent;
const yOf = (i: number) => i * props.rowHeight + props.rowHeight / 2;
const svgWidth = computed(
  () => RAIL_X + Math.max(0, ...props.items.map((item) => item.depth ?? 0)) * props.indent + 10,
);
const svgHeight = computed(() => props.items.length * props.rowHeight);

// Vertical runs connected by rounded S-bends where depth changes.
const railPath = computed(() => {
  if (!props.items.length) return '';
  let d = `M ${xOf(0)} ${yOf(0)}`;
  for (let i = 1; i < props.items.length; i++) {
    const x0 = xOf(i - 1);
    const x1 = xOf(i);
    const y1 = yOf(i);
    if (x0 === x1) {
      d += ` L ${x1} ${y1}`;
    } else {
      const corner = Math.min(12, props.rowHeight / 4, Math.abs(x1 - x0) / 2);
      const midY = yOf(i - 1) + props.rowHeight / 2;
      const dir = x1 > x0 ? 1 : -1;
      const sweep0 = dir === 1 ? 0 : 1;
      const sweep1 = dir === 1 ? 1 : 0;
      d += ` L ${x0} ${midY - corner}`;
      d += ` A ${corner} ${corner} 0 0 ${sweep0} ${x0 + corner * dir} ${midY}`;
      d += ` L ${x1 - corner * dir} ${midY}`;
      d += ` A ${corner} ${corner} 0 0 ${sweep1} ${x1} ${midY + corner}`;
      d += ` L ${x1} ${y1}`;
    }
  }
  return d;
});
const pathEl = useTemplateRef<SVGPathElement>('pathEl');
const totalLen = shallowRef(0);
const rowLens = shallowRef<number[]>([]);
const dotLen = shallowRef(0);
const dotVel = shallowRef(0);
const dot = shallowRef({ x: xOf(0), y: yOf(0) });

// Map each row to its arc length along the rail (y is monotonic).
function measure() {
  const path = pathEl.value;
  if (!path) {
    totalLen.value = 0;
    rowLens.value = [];
    return;
  }
  totalLen.value = path.getTotalLength();
  rowLens.value = props.items.map((_, i) => {
    const targetY = yOf(i);
    let lo = 0;
    let hi = totalLen.value;
    for (let step = 0; step < 24; step++) {
      const mid = (lo + hi) / 2;
      if (path.getPointAtLength(mid).y < targetY) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  });
}
watch([pathEl, railPath], measure, { flush: 'post' });

function updateDot() {
  const path = pathEl.value;
  if (!path) return;
  const point = path.getPointAtLength(Math.min(Math.max(dotLen.value, 0), totalLen.value));
  dot.value = { x: point.x, y: point.y };
}

const targetLen = computed(() => rowLens.value[active.value] ?? 0);
const { resume, pause } = useRafFn(
  ({ delta }) => {
    const dt = Math.min(delta / 1000, 1 / 30);
    const accel = 180 * (targetLen.value - dotLen.value) - 26 * dotVel.value;
    dotVel.value += accel * dt;
    dotLen.value += dotVel.value * dt;
    if (Math.abs(dotLen.value - targetLen.value) < 0.25 && Math.abs(dotVel.value) < 0.5) {
      dotLen.value = targetLen.value;
      dotVel.value = 0;
      pause();
    }
    updateDot();
  },
  { immediate: false },
);
watch(
  [targetLen, rowLens, reducedMotion],
  () => {
    if (reducedMotion.value === 'reduce' || !props.items.length) {
      pause();
      dotLen.value = targetLen.value;
      dotVel.value = 0;
      updateDot();
    } else {
      resume();
    }
  },
  { flush: 'post' },
);

function select(index: number, event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  active.value = index;
  // Let consumers handle selection before the NuxtLink click listener runs.
  emit('select', index, event);
}
const progressOffset = computed(() => Math.max(totalLen.value - dotLen.value, 0));
</script>

<template>
  <nav
    v-if="items.length"
    :aria-label="ariaLabel"
    :class="cn('w-full min-w-0 select-none', props.class)"
    data-animated-toc
  >
    <p
      v-if="title"
      class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase"
    >
      <FileTextIcon class="size-4" aria-hidden="true" />
      {{ title }}
    </p>
    <div class="relative flex">
      <svg
        v-show="progressBar"
        class="shrink-0"
        :width="svgWidth"
        :height="svgHeight"
        :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        aria-hidden="true"
      >
        <path ref="pathEl" :d="railPath" fill="none" class="stroke-border" stroke-width="2" stroke-linecap="round" />
        <path
          :d="railPath"
          fill="none"
          class="stroke-primary/60"
          stroke-width="2"
          stroke-linecap="round"
          :stroke-dasharray="totalLen"
          :stroke-dashoffset="progressOffset"
        />
        <circle :cx="dot.x" :cy="dot.y" r="5" class="fill-primary" />
      </svg>
      <ul class="min-w-0 flex-1">
        <li v-for="(item, i) in items" :key="item.href || i" :style="{ height: `${rowHeight}px` }">
          <NuxtLink
            :to="item.href"
            :title="item.label"
            :aria-current="i === active ? 'location' : undefined"
            :class="cn(
              'flex h-full min-w-0 cursor-pointer items-center text-sm transition-colors duration-300 motion-reduce:transition-none hover:text-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              i === active ? 'font-semibold text-primary' : 'text-muted-foreground',
            )"
            :style="{ paddingLeft: `${16 + (item.depth ?? 0) * indent}px` }"
            @click.capture="select(i, $event)"
          >
            <span class="min-w-0 truncate">{{ item.label }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
