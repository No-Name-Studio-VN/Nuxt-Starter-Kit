import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, onMounted, onUnmounted, type Component } from 'vue';
import { useRuntimeConfig } from '#imports';
import { useFormChallenge } from '@/composables/useFormChallenge';
import { registerExtension } from '@/utils/extensions';
import PasswordLoginForm from '#layers/auth-password/app/components/auth/PasswordLoginForm.vue';

function withProvider(provider: string, component: Component) {
  return defineComponent({
    setup() {
      const config = useRuntimeConfig().public;
      const previous = config.botProtection;
      config.botProtection = { provider, devTestKeys: false };
      onUnmounted(() => { config.botProtection = previous; });
      return () => h(component);
    },
  });
}

const loginForm = defineComponent({
  setup: () => () => h(PasswordLoginForm, {
    mode: 'login',
    redirectTo: '/app',
    pending: false,
    rememberedUsername: 'Alice',
  }),
});

describe('form challenge', () => {
  it('shows an unavailable alert and disables password sign-in when the selected widget is missing', async () => {
    const wrapper = await mountSuspended(withProvider('missing-widget', loginForm));
    try {
      expect(wrapper.get('[role="alert"]').text()).toBe('Security verification is unavailable. Please try again later.');
      expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    } finally {
      wrapper.unmount();
    }
  });

  it('submits the original username and challenge token as native form fields', async () => {
    registerExtension('form:challenge', {
      id: 'native-form-widget',
      order: 0,
      component: defineComponent({
        emits: ['update:modelValue'],
        setup(_props, { emit }) {
          onMounted(() => emit('update:modelValue', 'challenge-token'));
          return () => null;
        },
      }),
    });
    const wrapper = await mountSuspended(withProvider('native-form-widget', loginForm));
    try {
      const form = wrapper.get<HTMLFormElement>('form');
      expect(wrapper.get<HTMLInputElement>('input[name="bot-protection-token"]').element.value).toBe('challenge-token');
      expect(wrapper.get<HTMLInputElement>('input[name="username"]').element.value).toBe('Alice');
      expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined();
      let submittedFields: Record<string, FormDataEntryValue> | undefined;
      const submit = vi.spyOn(form.element, 'submit').mockImplementation(() => {
        submittedFields = Object.fromEntries(new FormData(form.element));
      });
      await wrapper.get('input[name="password"]').setValue('Secret#123');
      await form.trigger('submit');
      await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submittedFields).toEqual({
        'redirect-to': '/app',
        username: 'Alice',
        password: 'Secret#123',
        'bot-protection-token': 'challenge-token',
      });
      expect(form.element.method.toLowerCase()).toBe('post');
    } finally {
      wrapper.unmount();
    }
  });

  it('translates known API failure reasons and leaves other errors to the caller', async () => {
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        const challenge = useFormChallenge();
        return () => h('div', [
          ...['missing-token', 'invalid-token', 'unavailable', 'unknown'].map((reason) => h('p',
            challenge.errorMessage({ code: 'BOT_PROTECTION_FAILED', details: { reason } }) ?? 'Fallback',
          )),
          h('p', challenge.errorMessage({ code: 'OTHER_ERROR', details: { reason: 'unavailable' } }) ?? 'Fallback'),
        ]);
      },
    }));
    try {
      expect(wrapper.findAll('p').map((paragraph) => paragraph.text())).toEqual([
        'Complete the security check and try again.',
        'Security verification failed. Please try again.',
        'Security verification is unavailable. Please try again later.',
        'Fallback',
        'Fallback',
      ]);
    } finally {
      wrapper.unmount();
    }
  });
});
