import { useOAuthPopup } from './useOAuthPopup';
import type { AuthMethodEmitter } from '#layers/auth/types/authMethods';
import { parseApiError } from '#layers/server-core/app/utils/apiError';

export function useOAuthSignInPopup(emit: AuthMethodEmitter) {
  const { t } = useI18n();
  const popup = useOAuthPopup({
    onComplete(target) {
      emit('done', `${target.pathname}${target.search}${target.hash}`);
      return true;
    },
    onBlocked: () => emit('error', t('auth_oauth.popup_blocked')),
    onTimeout: () => emit('error', t('auth_oauth.popup_timed_out')),
    onError(error) {
      const message = parseApiError(error, t('auth_oauth.cannot_continue')).message;
      emit('error', message === 'auth_oauth.invalid_response' ? t(message) : message);
    },
  });

  watch(popup.activeProvider, (provider, previous) => {
    if (Boolean(provider) !== Boolean(previous)) emit('pending', Boolean(provider));
  }, { flush: 'sync' });
  return popup;
}
