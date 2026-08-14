<template>
  <Tabs v-if="variant === 'separate'" v-model="activeTabIndex" class="not-first:mt-5">
    <TabsList class="rounded-md p-1">
      <TabsTrigger
        v-for="(slot, i) in tabNodes"
        :key="`${i}${label(slot.props)}`"
        :value="i"
        class="rounded-sm px-3 py-1.5"
      >
        <CtIcon :name="icon(slot?.props)!" class="mr-1.5 self-center" />
        {{ label(slot.props) }}
      </TabsTrigger>
    </TabsList>

    <div
      v-for="(slot, i) in tabNodes"
      v-show="activeTabIndex === i"
      :key="`${i}${label(slot.props)}`"
      class="mt-2"
    >
      <component :is="slot" />
    </div>
  </Tabs>

  <Tabs
    v-else-if="variant === 'line'"
    v-model="activeTabIndex"
    class="relative mr-auto w-full not-first:mt-5"
  >
    <div class="flex items-center justify-between overflow-x-auto pb-3">
      <TabsList class="h-9 w-full justify-start rounded-none border-b bg-transparent p-0">
        <TabsTrigger
          v-for="(slot, i) in tabNodes"
          :key="`${i}${label(slot.props)}`"
          :value="i"
          class="text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:text-foreground relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold shadow-none transition-none data-[state=active]:shadow-none"
        >
          <CtIcon :name="icon(slot?.props)!" class="mr-1.5 self-center" />
          {{ label(slot.props) }}
        </TabsTrigger>
      </TabsList>
    </div>

    <div
      v-for="(slot, i) in tabNodes"
      v-show="activeTabIndex === i"
      :key="`${i}${label(slot.props)}`"
      class="relative mt-2 space-y-10"
    >
      <component :is="slot" />
    </div>
  </Tabs>

  <Card
    v-else-if="variant === 'card'"
    class="py-0 gap-0 rounded-lg bg-card shadow-xs not-first:mt-5"
    :class="[inStack && 'mb-0 rounded-none border-none shadow-none']"
  >
    <ScrollArea>
      <div class="relative flex overflow-x-auto border-b p-0.5 text-sm">
        <div class="flex p-1">
          <div
            v-for="(slot, i) in tabNodes"
            :key="`${i}${label(slot.props)}`"
            :value="label(slot.props)"
            class="text-muted-foreground flex cursor-pointer rounded-md px-3 py-1.5 transition-all duration-75"
            :class="[activeTabIndex === i && 'bg-muted text-primary']"
            @mousedown.left="activeTabIndex = i"
          >
            <CtIcon :name="icon(slot?.props)" class="mr-1.5 self-center" />
            {{ label(slot.props) }}
          </div>
        </div>
        <CtCodeCopy v-if="activeTabCode" class="ml-auto mr-2 self-center" :code="activeTabCode" />
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>

    <div
      v-for="(slot, i) in tabNodes"
      v-show="activeTabIndex === i"
      :key="`${i}${label(slot.props)}`"
      :value="label(slot.props)"
      class="mt-0"
      :class="[padded && !isPreTab(activeTab) && 'p-3']"
    >
      <component :is="slot" :in-group="true" />
    </div>
  </Card>

  <div v-else-if="variant === 'combobox'">
    <Popover v-model:open="dropDownOpen">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          role="combobox"
          :aria-expanded="dropDownOpen"
          class="h-10 w-50 justify-between"
        >
          <div class="flex items-center">
            <CtIcon :name="icon(activeTab?.props)" class="mr-1.5" />
            <span>
              {{ label(activeTab?.props) }}
            </span>
          </div>
          <ChevronsUpDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-50 p-0">
        <Command>
          <CommandInput v-if="!disableSearch" class="h-9" :placeholder="searchPlaceholder" />
          <CommandEmpty>{{ searchEmpty }}</CommandEmpty>
          <CommandList>
            <CommandGroup>
              <CommandItem
                v-for="(slot, i) in tabNodes"
                :key="`${i}${label(slot.props)}`"
                :value="label(slot.props)"
                @select="
                  () => {
                    activeTabIndex = i;
                    dropDownOpen = false;
                  }
                "
              >
                <CtIcon :name="slot.props?.icon" class="min-w-4 max-w-5.5 mr-1.5 self-center" />
                {{ label(slot.props) }}
                <CheckIcon
                  :class="cn('ml-auto size-4', activeTabIndex === i ? 'opacity-100' : 'opacity-0')"
                />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>

    <div
      v-for="(slot, i) in tabNodes"
      v-show="activeTabIndex === i"
      :key="`${i}${label(slot.props)}`"
      :value="label(slot.props)"
      class="mt-4"
    >
      <component :is="slot" :in-group="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import CtIcon from "@/components/content/CtIcon.vue";
import { cn } from "@/lib/utils";
import { ScrollBar } from "../ui/scroll-area";
import { ChevronsUpDownIcon, CheckIcon } from "@lucide/vue";

const slots = useSlots();

/** The tab nodes, and the one currently shown. */
const tabNodes = computed(() => slots.default?.() ?? []);

const props = defineProps<{
  slotsData: { label: string; index: number }[];
  variant?: "separate" | "card" | "line" | "combobox";
  padded?: boolean;
  inStack?: boolean;
  disableSearch?: boolean;
  searchPlaceholder?: string;
  searchEmpty?: string;
  sync?: string;
}>();
defineSlots();

const syncState = useCookie<{ scope: string; value?: string }[]>("tabs-sync-state", {
  default: () => [],
});

const syncScopeIndex = computed(() => syncState.value.findIndex((x) => x.scope === props.sync));

const activeTabIndexData = ref(0);
const activeTabIndex = computed<number>({
  get: () => {
    if (props.sync === undefined || syncScopeIndex.value === -1) return activeTabIndexData.value;

    return (
      props.slotsData.find((x) => x.label === syncState.value[syncScopeIndex.value]?.value)
        ?.index || activeTabIndexData.value
    );
  },
  set(index: number) {
    if (props.sync === undefined) {
      activeTabIndexData.value = index;
      return;
    }

    if (syncScopeIndex.value === -1) syncState.value.push({ scope: props.sync, value: undefined });

    const scope = syncState.value[syncScopeIndex.value];
    if (scope) scope.value = props.slotsData[index]?.label;
    activeTabIndexData.value = index;
  },
});

/** Props carried by a tab's slot node; every field is optional in MDC content. */
interface TabSlotProps {
  label?: string;
  filename?: string;
  icon?: string;
  language?: string;
  code?: string;
}

/**
 * Reads a tab's props off its VNode. Vue types slot props as a nullable index
 * signature, so the fields this component needs are picked out once here rather
 * than re-narrowed at each of the dozen call sites in the template.
 */
function tabProps(props?: Record<string, unknown> | null): TabSlotProps {
  if (!props) return {};

  const text = (key: keyof TabSlotProps) => {
    const value = props[key];
    return typeof value === 'string' ? value : undefined;
  };

  return {
    label: text('label'),
    filename: text('filename'),
    icon: text('icon'),
    language: text('language'),
    code: text('code'),
  };
}

function label(props?: Record<string, unknown> | null): string {
  const { label: title, filename } = tabProps(props);
  return title || filename || '';
}

function icon(props?: Record<string, unknown> | null): string {
  const { icon: name, language, filename } = tabProps(props);
  return name || language || filename?.toLowerCase() || '';
}

/** MDC renders fenced code as a `pre` element; those tabs supply their own padding. */
function isPreTab(node?: VNode): boolean {
  const type = node?.type;
  return typeof type === 'object' && type !== null && 'tag' in type && type.tag === 'pre';
}

const activeTab = computed(() => tabNodes.value[activeTabIndex.value]);
const activeTabCode = computed(() => tabProps(activeTab.value?.props).code);

const dropDownOpen = ref(false);
</script>
