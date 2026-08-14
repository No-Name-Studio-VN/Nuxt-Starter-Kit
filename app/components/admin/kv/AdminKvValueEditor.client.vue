<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        {{
          mode === 'json'
            ? 'JSON mode validates and formats the current value.'
            : 'Raw mode saves the value exactly as text.'
        }}
      </p>
      <div v-if="mode === 'json'" class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="disabled"
          @click="validateJson"
        >
          Validate JSON
        </Button>
        <Button type="button" variant="outline" size="sm" :disabled="disabled" @click="formatJson">
          Format
        </Button>
        <Button type="button" variant="outline" size="sm" :disabled="disabled" @click="minifyJson">
          Minify
        </Button>
      </div>
    </div>

    <div
      v-if="editorError"
      class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {{ editorError }} Falling back to a plain textarea.
    </div>

    <div
      v-show="!editorError"
      ref="editorHost"
      class="min-h-88 overflow-hidden rounded-md border bg-background text-sm"
    />

    <Textarea
      v-if="editorError"
      :model-value="modelValue"
      class="min-h-88 font-mono text-sm"
      :disabled="disabled"
      @update:model-value="(value) => emit('update:modelValue', String(value))"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import type { EditorView as CodeMirrorEditorView } from 'codemirror';
import type { AdminKvValueMode } from '#shared/schemas/adminKvSchema';

const props = defineProps<{
  modelValue: string;
  mode: AdminKvValueMode;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const editorHost = ref<HTMLDivElement | null>(null);
const editorError = ref('');
let editorView: CodeMirrorEditorView | null = null;

onMounted(async () => {
  if (!editorHost.value) return;

  try {
    const [{ EditorView, basicSetup }, { json }] = await Promise.all([
      import('codemirror'),
      import('@codemirror/lang-json'),
    ]);

    editorView = new EditorView({
      parent: editorHost.value,
      doc: props.modelValue,
      extensions: [
        basicSetup,
        json(),
        EditorView.lineWrapping,
        EditorView.editable.of(!props.disabled),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            emit('update:modelValue', update.state.doc.toString());
          }
        }),
      ],
    });
  } catch (error) {
    editorError.value = getErrorMessage(error);
  }
});

onBeforeUnmount(() => {
  editorView?.destroy();
  editorView = null;
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editorView) return;

    const currentValue = editorView.state.doc.toString();
    if (value === currentValue) return;

    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: value,
      },
    });
  },
);

function validateJson() {
  const result = parseJson(props.modelValue);

  if (!result.success) {
    toast.error(result.message);
    return;
  }

  toast.success('JSON is valid');
}

function formatJson() {
  updateWithJsonSpacing(2);
}

function minifyJson() {
  updateWithJsonSpacing(0);
}

function updateWithJsonSpacing(spaces: number) {
  const result = parseJson(props.modelValue);

  if (!result.success) {
    toast.error(result.message);
    return;
  }

  const formatted = JSON.stringify(result.value, null, spaces);
  emit('update:modelValue', formatted);
}

function parseJson(
  value: string,
): { success: true; value: unknown } | { success: false; message: string } {
  try {
    return {
      success: true,
      value: JSON.parse(value),
    };
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error),
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load the editor.';
}
</script>

<style scoped>
:deep(.cm-editor) {
  min-height: 22rem;
  background: var(--background);
  color: var(--foreground);
}

:deep(.cm-scroller) {
  font-family:
    ui-monospace, SFMono-Regular, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}

:deep(.cm-focused) {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

:deep(.cm-gutters) {
  background: var(--muted);
  color: var(--muted-foreground);
  border-right-color: var(--border);
}

:deep(.cm-activeLine),
:deep(.cm-activeLineGutter) {
  background: var(--muted);
}
</style>
