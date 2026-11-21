import { BOT_PROTECTION_TOKEN_HEADER } from '#shared/constants/formChallenge';
import type { FormChallengeError, FormChallengeState } from '~~/types/botProtection';

export function useFormChallenge() {
  const provider = useRuntimeConfig().public.botProtection?.provider;
  const { t, te } = useI18n();
  const token = ref('');
  const attempt = ref(0);
  const challenge: FormChallengeState = { provider, token, attempt };
  const pending = computed(() => !!provider && !token.value);

  function headers(): Record<string, string> {
    if (!provider || !token.value) return {};
    return { [BOT_PROTECTION_TOKEN_HEADER]: token.value };
  }

  function reset() {
    if (!provider) return;
    token.value = '';
    attempt.value += 1;
  }

  function errorMessage(error: FormChallengeError): string | undefined {
    if (error.code !== 'BOT_PROTECTION_FAILED') return;
    const { reason } = error.details;
    const key = reason === 'missing-token' ? 'bot_protection.required'
      : reason === 'invalid-token' ? 'bot_protection.failed'
        : reason === 'unavailable' ? 'bot_protection.unavailable' : undefined;
    if (key && te(key)) return t(key);
  }

  return { challenge, pending, headers, reset, errorMessage };
}
