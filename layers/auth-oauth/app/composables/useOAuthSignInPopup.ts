import { useOAuthPopup } from './useOAuthPopup';
import type { AuthMethodEmitter } from '#layers/auth/types/authMethods';
import { parseApiError } from '#layers/server-core/app/utils/apiError';

export function useOAuthSignInPopup(emit: AuthMethodEmitter) {
  const { te } = useI18n();
  const popup = useOAuthPopup({
    onComplete(target) {
      emit('done', `${target.pathname}${target.search}${target.hash}`);
      return true;
    },
    onBlocked: () => emit('error', 'auth_oauth.popup_blocked'),
    onTimeout: () => emit('error', 'auth_oauth.popup_timed_out'),
    onError(error) {
      const message = parseApiError(error).message;
      emit('error', te(message) ? message : 'auth_oauth.cannot_continue');
    },
  });

  watch(
    popup.activeProvider,
    (provider, previous) => {
      if (Boolean(provider) !== Boolean(previous)) emit('pending', Boolean(provider));
    },
    { flush: 'sync' },
  );
  return popup;
}
